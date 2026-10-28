// Correos automaticos de la promocion Buen Fin (ver src/promoBuenFin.js):
//
// - Recordatorios "Quedan 3 dias" (3 dias antes del fin, 10:00 am) y
//   "Ultimo dia" (el dia del fin, 9:00 am, hora CDMX). Les llegan a quienes
//   recibieron el correo de lanzamiento y todavia no compran. Se mandan con
//   el sistema de campañas (se retoman solos y se pueden cancelar); si se
//   mueve la fecha de fin, los recordatorios se mueven con ella.
// - "Tus eBooks te esperan": a quien eligio sus eBooks y no termino de
//   pagar, 2 horas despues, con los mismos eBooks ya elegidos.
//
// Todo se apaga con buenfin_recordatorios_activo o al cerrar la promocion.
const store = require('./store');
const promoBuenFin = require('./promoBuenFin');
const { SITE_URL } = require('./config');

const OFFSET_CDMX = '-06:00';
const HORAS_ESPERA_CARRITO = 2;
const HORAS_MAX_CARRITO = 72;

const RECORDATORIOS = [
  { clave: 'tres-dias', titulo: 'Quedan 3 días', asunto: (n) => `⏰ QUEDAN 3 DÍAS DEL ${n.toUpperCase()} EN ENDULCORA`, diasAntes: 3, hora: '10:00' },
  { clave: 'ultimo-dia', titulo: 'Último día', asunto: (n) => `⏰ ÚLTIMO DÍA: el ${n} de Endulcora termina hoy`, diasAntes: 0, hora: '09:00' },
];

function activos(contenido = store.getContent()) {
  return contenido.buenfin_recordatorios_activo !== 'false';
}

function diaCDMX(fecha) {
  return fecha.toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
}

// Fecha y hora (CDMX) en que sale cada recordatorio para el fin actual.
function horaRecordatorio(recordatorio, fin) {
  const dia = new Date(`${diaCDMX(fin)}T12:00:00${OFFSET_CDMX}`);
  dia.setTime(dia.getTime() - recordatorio.diasAntes * 24 * 60 * 60 * 1000);
  return new Date(`${diaCDMX(dia)}T${recordatorio.hora}:00${OFFSET_CDMX}`);
}

function plantilla(clave) {
  return `buen-fin-${clave}`;
}

// Campaña ya creada para este recordatorio y esta fecha de fin (aunque se
// haya cancelado: un recordatorio cancelado a mano no se vuelve a mandar).
function campanaDe(clave, fin) {
  return store.getCampanasCorreo().find((c) => c.plantilla === plantilla(clave) && c.finPromo === fin.toISOString() && promoBuenFin.esCampanaDeLaPromo(c)) || null;
}

function asuntoCarrito(nombre = promoBuenFin.configPromo().nombre) {
  return `Tus eBooks del ${nombre} te esperan 🛒`;
}

// Quienes recibieron el correo de lanzamiento, siguen suscritos y no han
// comprado en la promocion.
function destinatarios() {
  const recibieron = new Set();
  store.getCampanasCorreo().filter((c) => c.plantilla === 'buen-fin' && promoBuenFin.esCampanaDeLaPromo(c)).forEach((c) => (c.enviadosIds || []).forEach((id) => recibieron.add(id)));
  const compraron = promoBuenFin.correosQueYaCompraron();
  return store.getContactosCampana().filter((c) => recibieron.has(c.id) && c.activo !== false && !compraron.has(c.email));
}

// Lo que se ve en /admin: cada recordatorio con su hora y estado.
function programacion(ahora = new Date()) {
  const contenido = store.getContent();
  const { fin, nombre } = promoBuenFin.configPromo(contenido);
  const abierta = promoBuenFin.promoAbierta(contenido, ahora);
  const porMandar = destinatarios().length;
  return RECORDATORIOS.map((r, i) => {
    const hora = fin ? horaRecordatorio(r, fin) : null;
    const campana = fin ? campanaDe(r.clave, fin) : null;
    let estado = 'programado';
    if (campana) estado = campana.estado === 'cancelada' ? 'cancelado' : (campana.estado === 'terminada' ? 'enviado' : 'enviando');
    else if (!fin || !abierta || (hora && ahora >= fin)) estado = 'sin_promocion';
    else if (!activos(contenido)) estado = 'pausado';
    else if (hora && i === 0 && ahora >= horaRecordatorio(RECORDATORIOS[1], fin)) estado = 'omitido';
    return {
      clave: r.clave,
      titulo: r.titulo,
      asunto: r.asunto(nombre),
      hora: hora ? hora.toISOString() : null,
      estado,
      destinatarios: campana ? campana.total : porMandar,
      campana: campana ? { id: campana.id, enviados: campana.enviados, fallidos: campana.fallidos, omitidos: campana.omitidos || 0, total: campana.total, createdAt: campana.createdAt } : null,
    };
  });
}

// Crea la campaña del recordatorio que ya toca (uno por vuelta).
function revisarRecordatorios(ahora = new Date()) {
  const contenido = store.getContent();
  if (!activos(contenido) || !promoBuenFin.promoAbierta(contenido, ahora)) return null;
  const { fin, nombre, slug } = promoBuenFin.configPromo(contenido);
  const horaUltimo = horaRecordatorio(RECORDATORIOS[1], fin);
  for (const r of RECORDATORIOS) {
    const hora = horaRecordatorio(r, fin);
    if (ahora < hora || ahora >= fin || campanaDe(r.clave, fin)) continue;
    // Si el servidor estuvo apagado y ya es el ultimo dia, no se manda el
    // de "quedan 3 dias" (llegarian los dos juntos).
    if (r.clave === 'tres-dias' && ahora >= horaUltimo) continue;
    const lista = destinatarios();
    if (!lista.length) continue;
    const campana = store.addCampanaCorreo({
      asunto: r.asunto(nombre),
      cuerpoHtml: '',
      plantilla: plantilla(r.clave),
      ebookIds: promoBuenFin.masVendidosPromo(4).map((e) => e.id),
      contactoIds: lista.map((c) => c.id),
    });
    store.actualizarCampanaCorreo(campana.id, { finPromo: fin.toISOString(), promoSlug: slug });
    require('./campanas').procesarCampana(campana.id).catch(() => {});
    return campana;
  }
  return null;
}

// ---- "Tus eBooks te esperan" (pagos a medias) ----
function ebooksDelPedido(order) {
  const porId = new Map(promoBuenFin.ebooksPromo().map((e) => [e.id, e]));
  return (order.items || []).map((i) => porId.get(Number(i.itemId))).filter(Boolean)
    .map((e) => ({ id: e.id, titulo: e.titulo, imagen: e.imagen || '' }));
}

function datosCarrito(order, contacto) {
  return {
    ...promoBuenFin.datosCorreo([]),
    ebooks: [],
    variante: 'carrito',
    elegidos: ebooksDelPedido(order),
    nombre: contacto ? contacto.nombre : '',
    unsubscribeUrl: contacto ? `${SITE_URL}/desuscribir?id=${contacto.id}&token=${contacto.unsubToken}` : `${SITE_URL}/`,
  };
}

function candidatosCarrito(ahora = new Date()) {
  const pedidos = store.getOrders();
  const compraron = promoBuenFin.correosQueYaCompraron();
  const desde = ahora.getTime() - HORAS_MAX_CARRITO * 60 * 60 * 1000;
  const hasta = ahora.getTime() - HORAS_ESPERA_CARRITO * 60 * 60 * 1000;
  const yaAvisados = new Set(pedidos.filter((o) => o.recuperacionEnviadaAt && o.email).map((o) => o.email.toLowerCase()));
  const ultimoPorCorreo = new Map();
  pedidos
    .filter((o) => o.promo === promoBuenFin.configPromo().slug && ['pendiente', 'en_proceso'].includes(o.estado) && o.email)
    .forEach((o) => {
      const correo = o.email.toLowerCase();
      const previo = ultimoPorCorreo.get(correo);
      if (!previo || new Date(o.createdAt) > new Date(previo.createdAt)) ultimoPorCorreo.set(correo, o);
    });
  return [...ultimoPorCorreo.values()].filter((o) => {
    const t = new Date(o.createdAt).getTime();
    const correo = o.email.toLowerCase();
    return t >= desde && t <= hasta && !compraron.has(correo) && !yaAvisados.has(correo) && ebooksDelPedido(o).length;
  });
}

async function revisarCarritos(ahora = new Date()) {
  const contenido = store.getContent();
  if (!activos(contenido) || !promoBuenFin.promoAbierta(contenido, ahora)) return { enviados: 0 };
  const { enviarCorreoBuenFin } = require('./email');
  const revisarPagos = require('./revisarPagos');
  const client = require('./routes/checkout').mpClient();
  let enviados = 0;
  for (const order of candidatosCarrito(ahora)) {
    try {
      // Antes de escribirle se confirma con Mercado Pago que de verdad no
      // pago (ni dejo un OXXO pendiente): si si pago, esto lo aprueba.
      if (client) {
        const r = await revisarPagos.revisarPedido(order, { client, ahora, marcarAbandonados: false });
        if (r.resultado !== 'sin_pago') continue;
      }
      const correo = order.email.toLowerCase();
      store.importarContactosCampana([{ email: correo }]);
      const contacto = store.getContactosCampana().find((c) => c.email === correo);
      if (contacto && contacto.activo === false) {
        store.updateOrder(order.id, { recuperacionOmitida: 'baja' });
        continue;
      }
      await enviarCorreoBuenFin({ to: correo, asunto: asuntoCarrito(), ...datosCarrito(store.getOrder(order.id), contacto) });
      store.updateOrder(order.id, { recuperacionEnviadaAt: new Date().toISOString() });
      enviados += 1;
    } catch (err) {
      console.error(`[recordatoriosBuenFin] No se pudo mandar "Tus eBooks te esperan" (pedido ${order.id}):`, err.message);
    }
  }
  return { enviados };
}

function resumenCarritos() {
  const { slug } = promoBuenFin.configPromo();
  const pedidos = store.getOrders().filter((o) => o.recuperacionEnviadaAt && o.promo === slug);
  const correos = new Set(pedidos.map((o) => o.email.toLowerCase()));
  const recuperados = store.getOrders().filter((o) => o.promo === promoBuenFin.configPromo().slug && o.estado === 'aprobado' && o.email && correos.has(o.email.toLowerCase())
    && pedidos.some((p) => p.email.toLowerCase() === o.email.toLowerCase() && new Date(o.createdAt) > new Date(p.recuperacionEnviadaAt)));
  return { enviados: pedidos.length, recuperados: recuperados.length };
}

let corriendo = false;
async function revisar(ahora = new Date()) {
  if (corriendo) return;
  corriendo = true;
  try {
    revisarRecordatorios(ahora);
    await revisarCarritos(ahora);
  } catch (err) {
    console.error('[recordatoriosBuenFin] Falló la revisión:', err.message);
  } finally {
    corriendo = false;
  }
}

function iniciarRecordatoriosBuenFin() {
  setTimeout(() => revisar(), 4 * 60 * 1000);
  setInterval(() => revisar(), 10 * 60 * 1000);
}

module.exports = {
  RECORDATORIOS,
  asuntoCarrito,
  horaRecordatorio,
  programacion,
  destinatarios,
  revisarRecordatorios,
  revisarCarritos,
  candidatosCarrito,
  datosCarrito,
  resumenCarritos,
  revisar,
  iniciarRecordatoriosBuenFin,
};
