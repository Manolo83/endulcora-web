// Revision de pedidos pendientes con Mercado Pago. Si el aviso (webhook) de
// un pago no llego, el pedido se quedaba "Pendiente" para siempre aunque la
// persona si hubiera pagado. Aqui se le pregunta a Mercado Pago por cada
// pedido pendiente y se aplica lo que encuentre, igual que el aviso.
//
// - Boton en /admin > Ventas: revisa todos los pendientes.
// - Automatico cada hora: los pendientes de los ultimos 3 dias, y los de mas
//   de 7 dias sin ningun pago pasan a "Abandonado".
const { Payment } = require('mercadopago');
const store = require('./store');

const DIAS_REVISION_AUTOMATICA = 3;
const DIAS_PARA_ABANDONADO = 7;
const ESTADOS_PENDIENTES = ['pendiente', 'en_proceso'];
const DIA_MS = 24 * 60 * 60 * 1000;

// Se carga al usarse para no crear una dependencia circular con las rutas.
function checkout() {
  return require('./routes/checkout');
}

function pedidosPendientes() {
  return store.getOrders().filter((o) => ESTADOS_PENDIENTES.includes(o.estado));
}

// De todos los pagos de un pedido (puede haber un rechazo y luego un pago
// bueno), el que manda: aprobado, luego en espera, luego rechazado.
function pagoPrincipal(pagos) {
  const orden = ['approved', 'authorized', 'in_process', 'pending', 'in_mediation', 'rejected', 'cancelled', 'refunded', 'charged_back'];
  return [...pagos].sort((a, b) => {
    const pa = orden.indexOf(a.status);
    const pb = orden.indexOf(b.status);
    return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb);
  })[0];
}

const ETIQUETA_TIPO = { ticket: 'OXXO', atm: 'pago en efectivo', bank_transfer: 'transferencia' };

// Revisa un pedido. Regresa el resultado que se guarda en el pedido
// (order.revisionMp) para mostrarlo en Ventas.
async function revisarPedido(order, { client, ahora = new Date(), marcarAbandonados = true } = {}) {
  const payment = new Payment(client);
  const busqueda = await payment.search({ options: { external_reference: String(order.id), sort: 'date_created', criteria: 'desc' } });
  const pagos = (busqueda && busqueda.results) || [];
  const fecha = ahora.toISOString();
  let revision;

  if (!pagos.length) {
    const edadDias = (ahora - new Date(order.createdAt)) / DIA_MS;
    if (marcarAbandonados && edadDias >= DIAS_PARA_ABANDONADO) {
      revision = { resultado: 'abandonado', fecha };
      store.updateOrder(order.id, { estado: 'abandonado', revisionMp: revision });
    } else {
      revision = { resultado: 'sin_pago', fecha };
      store.updateOrder(order.id, { revisionMp: revision });
    }
    return revision;
  }

  const principal = pagoPrincipal(pagos);
  // La busqueda trae un resumen; el pago completo se pide aparte para
  // aplicarlo con exactamente los mismos datos que manda el aviso.
  const info = await payment.get({ id: principal.id });
  if (String(info.external_reference) !== String(order.id)) return { resultado: 'sin_pago', fecha };
  await checkout().aplicarPagoAlPedido(info);

  if (info.status === 'approved') revision = { resultado: 'pagado', fecha, pagadoEn: info.date_approved || '' };
  else if (['pending', 'in_process', 'authorized', 'in_mediation'].includes(info.status)) {
    revision = { resultado: 'en_espera', fecha, tipo: ETIQUETA_TIPO[info.payment_type_id] || '', vence: info.date_of_expiration || '' };
  } else revision = { resultado: 'rechazado', fecha, estadoMp: info.status };
  store.updateOrder(order.id, { revisionMp: revision });
  return revision;
}

// Estado del ultimo recorrido (para la barra de avance del admin).
const estado = { enCurso: false, total: 0, revisados: 0, conteo: {}, errores: 0, terminadoAt: null, origen: '' };

async function revisarPendientes({ soloRecientes = false, origen = 'boton', pausaMs = 250 } = {}) {
  if (estado.enCurso) return estado;
  const client = checkout().mpClient();
  if (!client) throw new Error('Mercado Pago todavía no está configurado.');
  const ahora = new Date();
  let lista = pedidosPendientes();
  if (soloRecientes) {
    // Automatico: los recientes (por si el aviso no llego) y los que ya
    // cumplieron los dias para pasar a Abandonado.
    lista = lista.filter((o) => {
      const edad = (ahora - new Date(o.createdAt)) / DIA_MS;
      return edad <= DIAS_REVISION_AUTOMATICA || edad >= DIAS_PARA_ABANDONADO;
    });
  }
  Object.assign(estado, { enCurso: true, total: lista.length, revisados: 0, conteo: {}, errores: 0, terminadoAt: null, origen });
  try {
    for (const order of lista) {
      try {
        const r = await revisarPedido(order, { client, ahora });
        estado.conteo[r.resultado] = (estado.conteo[r.resultado] || 0) + 1;
      } catch (err) {
        estado.errores += 1;
        console.error(`[revisarPagos] No se pudo revisar el pedido ${order.id}:`, err.message);
      }
      estado.revisados += 1;
      if (pausaMs) await new Promise((r) => setTimeout(r, pausaMs));
    }
  } finally {
    estado.enCurso = false;
    estado.terminadoAt = new Date().toISOString();
  }
  return estado;
}

function iniciarRevisionAutomatica() {
  const correr = () => revisarPendientes({ soloRecientes: true, origen: 'automatico' }).catch((err) => {
    console.error('[revisarPagos] Falló la revisión automática:', err.message);
  });
  setTimeout(correr, 5 * 60 * 1000);
  setInterval(correr, 60 * 60 * 1000);
}

module.exports = { revisarPendientes, revisarPedido, pedidosPendientes, iniciarRevisionAutomatica, estadoRevision: () => ({ ...estado }), DIAS_PARA_ABANDONADO };
