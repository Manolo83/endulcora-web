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

// Manda UNA inscripcion a Sheets (la usan tanto el barrido automatico como
// el boton de "reintentar" en /admin). Tira el error tal cual para que quien
// la llamo decida que hacer (el barrido solo lo registra y lo vuelve a
// intentar despues; /admin se lo muestra a la persona).
async function sincronizarInscripcionTaller(inscripcion) {
  if (!googleSheets.configurado()) {
    throw new Error(`Google Sheets no esta configurado todavia: ${googleSheets.faltantes().join(', ')}.`);
  }
  const completos = datosCompletos(inscripcion);
  const { sesion, sede } = completos;
  // Cada taller vive en su propia pestaña; las de la sede División terminan
  // en " div" (ej. "Palomitas division", "Especial Pumpkin div"). Si el
  // admin no fijo un nombre exacto en hojaSheets, se adivina con esa misma
  // convencion a partir del nombre de la sede.
  const esDivision = sede && /divisi[oó]n/i.test(sede.nombre);
  const hoja = (sesion && sesion.hojaSheets) || `${inscripcion.taller}${esDivision ? ' div' : ''}`;
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
    const calendario = await sincronizarCalendarioFisico();
    if (calendario.creadas > 0 || calendario.errores.length || calendario.avisos.length) {
      console.log(`[talleres] Calendario fisico: ${calendario.creadas} nuevos, ${calendario.saltadas} ya existian.`, calendario.errores, calendario.avisos);
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
  sincronizarInscripcionTaller,
  avisarEquipoNuevoTaller,
};
