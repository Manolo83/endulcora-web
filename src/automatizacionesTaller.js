// Automatizaciones de la Fase 4 del cobro de talleres: recordatorios por
// correo (2 dias antes + el mismo dia) y la fila en el Google Sheet
// "Inscritos 2026". Es un modulo APARTE de src/automatizaciones.js (el de la
// secuencia del lead magnet y el recordatorio de membresia) a proposito: ese
// esta pausado a peticion del dueño del sitio, y esto es una automatizacion
// nueva y distinta que si se pidio activar — no hay que mezclar los dos
// interruptores.
const store = require('./store');
const email = require('./email');
const googleSheets = require('./googleSheets');
const { EQUIPO_NOTIFICACIONES_EMAIL } = require('./config');

const INTERVALO_MS = 30 * 60 * 1000; // cada 30 minutos es de sobra para avisos de dias

function fechaISO(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// Junta la inscripcion con su sesion y su sede — lo que piden tanto el
// recordatorio por correo como la fila de Sheets.
function datosCompletos(inscripcion) {
  const sesion = store.getSesionesTaller().find((s) => s.id === inscripcion.sesionTallerId) || null;
  const sede = sesion ? store.getSedes().find((s) => s.id === sesion.sedeId) : null;
  return { inscripcion, sesion, sede };
}

async function revisarRecordatoriosTaller() {
  const hoy = new Date();
  const fechaHoy = fechaISO(hoy);
  const fechaEn2Dias = fechaISO(new Date(hoy.getTime() + 2 * 24 * 60 * 60 * 1000));

  const tandas = [
    { campo: 'recordatorio2diasEnviado', fecha: fechaEn2Dias, diasFaltan: 2 },
    { campo: 'recordatorioMismoDiaEnviado', fecha: fechaHoy, diasFaltan: 0 },
  ];

  for (const tanda of tandas) {
    const pendientes = store.getInscripcionesTallerParaRecordatorio(tanda.campo, tanda.fecha);
    for (const inscripcion of pendientes) {
      try {
        const { sesion, sede } = datosCompletos(inscripcion);
        const contenido = store.getContent();
        await email.enviarCorreoRecordatorioTaller({
          to: inscripcion.correo,
          nombre: inscripcion.nombre,
          taller: inscripcion.taller,
          fecha: inscripcion.fecha,
          horario: inscripcion.horario,
          sede: inscripcion.sede,
          direccion: sede ? sede.direccion : '',
          mapaLink: sede ? sede.mapaLink : '',
          queAprendes: sesion ? sesion.queAprendes : '',
          tipoPago: inscripcion.tipoPago,
          saldo: inscripcion.saldo,
          diasFaltan: tanda.diasFaltan,
          numeroWhatsapp: contenido.whatsapp_numero,
        });
        store.marcarRecordatorioTallerEnviado(inscripcion.id, tanda.campo);
      } catch (e) {
        console.error(`[talleres] No se pudo mandar el recordatorio (${tanda.campo}) a ${inscripcion.correo}:`, e.message);
      }
    }
  }
}

// Fila lista para "Inscritos 2026". El orden de columnas es un supuesto
// razonable (no se confirmo contra la hoja real todavia) — se ajusta en
// cuanto se vean los encabezados reales desde /admin > Google Sheets.
function filaParaSheets({ inscripcion, sesion, sede }) {
  return [
    inscripcion.nombre,
    inscripcion.whatsapp,
    inscripcion.correo,
    inscripcion.taller,
    inscripcion.fecha,
    inscripcion.horario,
    sede ? sede.nombre : inscripcion.sede,
    inscripcion.tipoPago === 'completo' ? 'Completo' : 'Anticipo',
    inscripcion.montoPagado,
    inscripcion.saldo ?? '',
    inscripcion.esDeMexico ? (inscripcion.estado || 'México') : (inscripcion.pais || ''),
    new Date(inscripcion.createdAt).toLocaleDateString('es-MX'),
  ];
}

// Manda UNA inscripcion a Sheets (la usan tanto el barrido automatico como
// el boton de "reintentar" en /admin). Tira el error tal cual para que quien
// la llamo decida que hacer (el barrido solo lo registra y lo vuelve a
// intentar despues; /admin se lo muestra a la persona).
async function sincronizarInscripcionTaller(inscripcion) {
  if (!googleSheets.configurado()) {
    throw new Error(`Google Sheets no esta configurado todavia: ${googleSheets.faltantes().join(', ')}.`);
  }
  const completos = datosCompletos(inscripcion);
  const hoja = (completos.sesion && completos.sesion.hojaSheets) || inscripcion.taller;
  await googleSheets.agregarFila(hoja, filaParaSheets(completos));
  store.marcarInscripcionTallerSincronizada(inscripcion.id);
}

async function revisarSincronizacionSheets() {
  if (!googleSheets.configurado()) return; // nada que hacer todavia, sin ruido en el log
  const pendientes = store.getInscripcionesTallerSinSincronizar();
  for (const inscripcion of pendientes) {
    try {
      await sincronizarInscripcionTaller(inscripcion);
    } catch (e) {
      console.error(`[talleres] No se pudo escribir en Google Sheets la inscripcion ${inscripcion.id}:`, e.message);
    }
  }
}

// Correo interno al equipo cuando se confirma un pago — lo llama el webhook
// de Mercado Pago (src/routes/checkout.js) justo despues de aprobar.
async function avisarEquipoNuevoTaller(inscripcion) {
  if (!EQUIPO_NOTIFICACIONES_EMAIL.length) return; // nadie configurado, no es obligatorio
  const { sede } = datosCompletos(inscripcion);
  await email.enviarAvisoEquipoNuevoTaller({
    to: EQUIPO_NOTIFICACIONES_EMAIL,
    nombre: inscripcion.nombre,
    whatsapp: inscripcion.whatsapp,
    correo: inscripcion.correo,
    taller: inscripcion.taller,
    fecha: inscripcion.fecha,
    horario: inscripcion.horario,
    sede: sede ? sede.nombre : inscripcion.sede,
    tipoPago: inscripcion.tipoPago,
    montoPagado: inscripcion.montoPagado,
    saldo: inscripcion.saldo,
  });
}

let corriendo = false;
async function revisarAutomatizacionesTaller() {
  if (corriendo) return;
  corriendo = true;
  try {
    await revisarRecordatoriosTaller();
    await revisarSincronizacionSheets();
  } catch (e) {
    console.error('[talleres] Error revisando automatizaciones:', e.message);
  } finally {
    corriendo = false;
  }
}

function iniciarAutomatizacionesTaller() {
  revisarAutomatizacionesTaller();
  setInterval(revisarAutomatizacionesTaller, INTERVALO_MS);
}

module.exports = {
  iniciarAutomatizacionesTaller,
  revisarAutomatizacionesTaller,
  sincronizarInscripcionTaller,
  avisarEquipoNuevoTaller,
};
