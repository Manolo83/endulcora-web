// Correos automaticos a quien aparto lugar en un taller, llego a Mercado Pago
// y no termino de pagar. Mismo mecanismo que "Tus eBooks te esperan" (ver
// src/recordatoriosBuenFin.js), pero para talleres.
//
// Son dos avisos, los dos dentro de las 72 horas que el sistema de verdad le
// guarda el lugar (HORAS_VENCE_PENDIENTE_TALLER en src/routes/checkout.js):
//
//   1. A las 2 horas  — "tu lugar sigue apartado".
//   2. A las 48 horas — "se libera mañana", ultimo aviso.
//
// Despues de las 72 horas ya no se escribe: el lugar se libero solo y
// prometerle algo que ya no existe es mentirle.
//
// TODO LO QUE DICE EL CORREO ES VERIFICABLE y sale de la base: la fecha y
// sede del taller, lo que falta por pagar, la hora exacta en que se libera su
// lugar y, cuando quedan pocos, cuantos lugares quedan de verdad
// (cupoRestanteTaller). No se inventa escasez ni se mueven fechas: si alguien
// llega y descubre que el apuro era falso, se pierde al cliente y de paso la
// confianza en todos los demas correos.
//
// Se apaga desde /admin con recuperacion_taller_activa.
const store = require('./store');
const { SITE_URL } = require('./config');

const HORAS_GUARDADO = 72;
const AVISOS = [
  { clave: 'primer_aviso', horas: 2 },
  { clave: 'ultimo_aviso', horas: 48 },
];

function activa(contenido = store.getContent()) {
  return contenido.recuperacion_taller_activa !== 'false';
}

// El renglon de taller de un pedido a medias, con su inscripcion.
function tallerDelPedido(order) {
  const linea = (order.items || []).find((i) => i.tipo === 'taller');
  if (!linea) return null;
  const inscripcion = linea.inscripcionTallerId ? store.getInscripcionTaller(linea.inscripcionTallerId) : null;
  if (!inscripcion || inscripcion.estadoPago === 'pagado') return null;
  const sesion = store.getSesionesTaller().find((s) => s.id === inscripcion.sesionTallerId);
  return { linea, inscripcion, sesion };
}

// Cual de los dos avisos toca mandarle a este pedido, si es que toca alguno.
function avisoQueToca(order, ahora) {
  const enviados = order.recuperacionTallerAvisos || [];
  const horas = (ahora.getTime() - new Date(order.createdAt).getTime()) / (60 * 60 * 1000);
  if (horas >= HORAS_GUARDADO) return null;
  // El ultimo que ya le toque por tiempo y todavia no se le haya mandado. Si
  // el servidor estuvo apagado y se le paso el primero, se le manda el que
  // corresponde a la hora actual, no los dos de golpe.
  const toca = AVISOS.filter((a) => horas >= a.horas && !enviados.includes(a.clave));
  return toca.length ? toca[toca.length - 1] : null;
}

function candidatos(ahora = new Date()) {
  return store.getOrders()
    .filter((o) => ['pendiente', 'en_proceso'].includes(o.estado) && o.email && tallerDelPedido(o))
    .map((o) => ({ order: o, aviso: avisoQueToca(o, ahora) }))
    .filter((c) => c.aviso);
}

// La fecha de un taller viene como 'YYYY-MM-DD', sin hora. Se le pega
// T00:00:00 y NO se pide zona horaria, igual que los demas correos de taller
// en src/email.js: asi se lee y se escribe en la misma zona y el dia sale
// tal cual esta en el calendario.
//
// Leerla con new Date('2026-11-05') a secas la toma como medianoche UTC, que
// en Mexico es la tarde del dia ANTERIOR: el correo le anunciaba al cliente
// el 4 de noviembre un taller que es el 5.
function fechaLarga(fecha) {
  if (!fecha) return '';
  const texto = String(fecha);
  const soloFecha = /^\d{4}-\d{2}-\d{2}$/.test(texto);
  if (!soloFecha) return '';
  return new Date(`${texto}T00:00:00`).toLocaleDateString('es-MX', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
}

function fechaYHoraCorta(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('es-MX', {
    weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit',
    timeZone: 'America/Mexico_City',
  });
}

// Lo que se le dice, armado con datos de la base. `anticipo` solo se ofrece a
// quien habia elegido pagar completo: para quien ya iba por el anticipo no
// hay nada mas barato que ofrecerle.
function datosCorreo({ order, inscripcion, sesion, aviso }) {
  const esUltimo = aviso.clave === 'ultimo_aviso';
  const pagoCompleto = inscripcion.tipoPago === 'completo';
  const anticipo = Number(sesion && sesion.anticipo) || 0;
  const cupo = sesion && typeof sesion.cupoRestante === 'number' ? sesion.cupoRestante : null;
  return {
    nombre: (inscripcion.nombre || '').split(' ')[0] || '',
    taller: inscripcion.taller || (sesion && sesion.titulo) || 'tu taller',
    fechaTaller: fechaLarga(inscripcion.fecha || (sesion && sesion.fecha)),
    horario: inscripcion.horario || '',
    sede: inscripcion.sede || '',
    monto: Number(order.total) || 0,
    venceEn: fechaYHoraCorta(order.vencePendienteEn || inscripcion.vencePendienteEn),
    // Solo se menciona el cupo cuando de verdad queda poco y el dato existe.
    lugares: cupo !== null && cupo > 0 && cupo <= 5 ? cupo : null,
    // La salida mas barata que de verdad existe en el sitio.
    anticipo: pagoCompleto && anticipo > 0 ? anticipo : null,
    link: sesion && sesion.slug ? `${SITE_URL}/talleres/${sesion.slug}` : `${SITE_URL}/calendario`,
    esUltimo,
  };
}

async function revisar(ahora = new Date()) {
  if (!activa()) return { enviados: 0 };
  const { enviarCorreoRecuperacionTaller } = require('./email');
  const revisarPagos = require('./revisarPagos');
  let client = null;
  try { client = require('./routes/checkout').mpClient(); } catch (e) { client = null; }

  let enviados = 0;
  for (const { order, aviso } of candidatos(ahora)) {
    try {
      // Igual que en los eBooks: antes de escribirle se le pregunta a Mercado
      // Pago si de verdad no pago. Si si pago (o dejo un OXXO en camino),
      // esto lo aprueba y no se le manda nada. Escribirle "no terminaste de
      // pagar" a alguien que ya pago es el peor error posible aqui.
      if (client) {
        const r = await revisarPagos.revisarPedido(order, { client, ahora, marcarAbandonados: false });
        if (r.resultado !== 'sin_pago') continue;
      }
      const correo = order.email.toLowerCase();
      const contacto = store.getContactosCampana().find((c) => c.email === correo);
      if (contacto && contacto.activo === false) {
        store.updateOrder(order.id, { recuperacionTallerOmitida: 'baja' });
        continue;
      }
      // Se relee al momento de escribir: getSesionesTaller ya trae
      // cupoRestante calculado, y entre que se armo la lista y sale el correo
      // el cupo pudo cambiar.
      const datos = tallerDelPedido(order);
      if (!datos) continue;

      await enviarCorreoRecuperacionTaller({
        to: correo,
        ...datosCorreo({ order, inscripcion: datos.inscripcion, sesion: datos.sesion, aviso }),
        unsubscribeUrl: contacto ? `${SITE_URL}/desuscribir?id=${contacto.id}&token=${contacto.unsubToken}` : '',
        numeroWhatsapp: (store.getContent() || {}).whatsapp_numero || '',
      });
      store.updateOrder(order.id, {
        recuperacionTallerAvisos: [...(order.recuperacionTallerAvisos || []), aviso.clave],
        recuperacionTallerEnviadaAt: new Date().toISOString(),
      });
      enviados += 1;
    } catch (err) {
      console.error(`[recuperarPagosTaller] No se pudo mandar el aviso del pedido ${order.id}:`, err.message);
    }
  }
  if (enviados) console.log(`[recuperarPagosTaller] ${enviados} aviso(s) de pago pendiente enviados.`);
  return { enviados };
}

// Para ver si sirve: cuantos avisos salieron y a cuantos de esos se les
// aprobo despues el pedido.
function resumen() {
  const avisados = store.getOrders().filter((o) => (o.recuperacionTallerAvisos || []).length);
  const recuperados = avisados.filter((o) => o.estado === 'aprobado');
  return { avisados: avisados.length, recuperados: recuperados.length };
}

let corriendo = false;
async function vuelta() {
  if (corriendo) return;
  corriendo = true;
  try {
    await revisar();
  } catch (err) {
    console.error('[recuperarPagosTaller] Fallo la revision:', err.message);
  } finally {
    corriendo = false;
  }
}

function iniciarRecuperacionPagosTaller() {
  setTimeout(vuelta, 5 * 60 * 1000);
  setInterval(vuelta, 15 * 60 * 1000);
}

module.exports = {
  iniciarRecuperacionPagosTaller,
  revisar,
  candidatos,
  datosCorreo,
  avisoQueToca,
  resumen,
  activa,
  AVISOS,
  HORAS_GUARDADO,
};
