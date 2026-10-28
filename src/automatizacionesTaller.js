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
const { sincronizarCalendarioFisico } = require('./syncCalendarioTalleres');
const { EQUIPO_NOTIFICACIONES_EMAIL, SITE_URL } = require('./config');

const INTERVALO_MS = 30 * 60 * 1000; // cada 30 minutos es de sobra para avisos de dias

// Junta la inscripcion con su sesion y su sede — lo que piden tanto el
// recordatorio por correo como la fila de Sheets.
function datosCompletos(inscripcion) {
  const sesion = store.getSesionesTaller().find((s) => s.id === inscripcion.sesionTallerId) || null;
  const sede = sesion ? store.getSedes().find((s) => s.id === sesion.sedeId) : null;
  return { inscripcion, sesion, sede };
}

// Recordatorio de taller (correo 10 del plan de ventas): uno solo, el dia
// anterior desde las 10:00 am de CDMX.
async function revisarRecordatoriosTaller(ahora = new Date()) {
  const diaCDMX = (d) => d.toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
  const horaCDMX = Number(ahora.toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/Mexico_City' }));
  if (horaCDMX < 10) return;
  const manana = diaCDMX(new Date(ahora.getTime() + 24 * 60 * 60 * 1000));

  const tandas = [
    { campo: 'recordatorio1diaEnviado', fecha: manana, diasFaltan: 1 },
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
          comunidadLink: contenido.comunidad_avisos_link,
          arteUrl: sesion && sesion.fotoUrl ? (/^https?:\/\//.test(sesion.fotoUrl) ? sesion.fotoUrl : `${SITE_URL}${sesion.fotoUrl}`) : '',
        });
        store.marcarRecordatorioTallerEnviado(inscripcion.id, tanda.campo);
      } catch (e) {
        console.error(`[talleres] No se pudo mandar el recordatorio (${tanda.campo}) a ${inscripcion.correo}:`, e.message);
      }
    }
  }
}

// "01 agosto" — dia con cero y mes en español, sin año, igual que la hoja real.
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
function fechaCortaSheets(fechaISOStr) {
  if (!fechaISOStr) return '';
  const [anio, mes, dia] = fechaISOStr.split('-').map(Number);
  return `${String(dia).padStart(2, '0')} ${MESES[mes - 1] || ''}`;
}

// Fila lista para "Inscritos 2026", en el orden real de la hoja (confirmado
// con el dueño del sitio sobre la pestaña "Velas comestibles"):
// NOMBRE | ANTICIPO | DEBE | DIA/HORA | RECONOCIMIENTO | Recetario | MATERIAL
// | MEMBRESIA | BETTERWARE | APARTADO | PAGO | ESTATUS | FORMA DE PAGO
//
// A peticion del dueño del sitio, el llenado automatico solo toca CUATRO
// columnas: NOMBRE, ANTICIPO (cuanto dio de apartado), DEBE (cuanto le
// falta por pagar) y DIA/HORA (la fecha en la que asiste) — el resto de la
// fila se deja vacia a proposito, el equipo la llena a mano.
//
// DEBE se calcula contra el precio total REAL del taller (precioTotal -
// montoPagado), nunca contra el campo "saldo" guardado en la inscripcion:
// ese campo solo se llena cuando pasa un pago de verdad, asi que para una
// inscripcion gratuita (el formulario corto, sin ningun pago) se quedaba
// vacio y antes se leia por error como "ya pagado". Calculandolo siempre
// desde el precio del taller, alguien que no pago nada correctamente debe
// el precio completo, no "PAGADO".
//
// El color de las celdas (ej. verde cuando alguien asiste) lo pone el
// equipo a mano para su propio control — el servidor nunca manda ningun
// formato ni color, solo agrega texto plano con la API de valores de
// Sheets (values.append), que no toca el formato de la fila.
function filaParaSheets({ inscripcion, sesion }) {
  const precioTotal = sesion ? Number(sesion.precioTotal) || 0 : 0;
  const montoPagado = Number(inscripcion.montoPagado) || 0;
  const faltante = Math.max(0, precioTotal - montoPagado);
  const debe = precioTotal > 0 ? (faltante > 0 ? faltante : 'PAGADO') : '';
  return [
    inscripcion.nombre, // NOMBRE
    inscripcion.montoPagado, // ANTICIPO
    debe, // DEBE
    fechaCortaSheets(inscripcion.fecha), // DIA/HORA
    '', // RECONOCIMIENTO — se captura a mano
    '', // Recetario — se captura a mano
    '', // MATERIAL — se captura a mano
    '', // MEMBRESIA — se captura a mano
    '', // BETTERWARE — se captura a mano
    '', // APARTADO — se captura a mano
    '', // PAGO — se captura a mano
    '', // ESTATUS — se captura a mano
    '', // FORMA DE PAGO — se captura a mano
  ];
}

// Cada taller vive en su propia pestaña; las de la sede División terminan
// en " div" (ej. "Palomitas division", "Especial Pumpkin div"). Si el admin
// no fijo un nombre exacto en hojaSheets, se adivina con esa misma
// convencion a partir del nombre de la sede. Se usa tanto al sincronizar
// como para la herramienta de "verificar pestañas" en /admin.
function hojaCalculadaPara({ taller, sesion, sede }) {
  const esDivision = sede && /divisi[oó]n/i.test(sede.nombre);
  return (sesion && sesion.hojaSheets) || `${taller}${esDivision ? ' div' : ''}`;
}

// La sincronizacion automatica con "Inscritos 2026" quedo DESACTIVADA a
// peticion del dueño del sitio (volvio a ser 100% manual, como antes de
// esta automatizacion) — se va a reconstruir de cero mas adelante. Esta
// funcion ya no escribe nada en Sheets; solo avisa en el log por si algo
// todavia la llama, sin tronar el flujo que la rodea (compra, registro
// manual, etc. siguen funcionando igual).
async function sincronizarInscripcionTaller(inscripcion) {
  console.log(`[talleres] Sincronizacion con Google Sheets desactivada (manual por ahora) — se omite la inscripcion ${inscripcion.id}.`);
}

async function revisarSincronizacionSheets() {
  // desactivado, ver nota arriba
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
    const calendario = await sincronizarCalendarioFisico();
    if (calendario.creadas > 0 || calendario.errores.length || calendario.avisos.length) {
      console.log(`[talleres] Calendario fisico: ${calendario.creadas} nuevos, ${calendario.saltadas} ya existian.`, calendario.errores, calendario.avisos);
    }
    const cambiosNov26S1 = store.asegurarTalleresNov26S1();
    if (cambiosNov26S1 > 0) {
      console.log(`[talleres] ${cambiosNov26S1} ajustes en los talleres de nov26 semana 1 (fusion/foto/precio).`);
    }
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
  revisarRecordatoriosTaller,
  sincronizarInscripcionTaller,
  avisarEquipoNuevoTaller,
  hojaCalculadaPara,
};
