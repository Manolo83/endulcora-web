// Envio masivo del correo "¿Asistirás?" de la clase gratis (dos botones
// Sí/No, control de aforo con tope de 100 por horario, ver
// store.responderClaseGratis y el plan aprobado con el dueño del sitio).
// Mismo patron de resumibilidad
// que src/campanas.js: guarda de inmediato quien ya quedo procesado, para
// que si el servidor se reinicia a la mitad (ej. un deploy) se retome solo
// donde se quedo en vez de perder el resto o repetir correos.
const store = require('./store');
const { SITE_URL } = require('./config');
const { enviarCorreoConfirmarClaseGratis, enviarCorreoRecordatorioClaseGratis } = require('./email');

let procesando = false;

function fechaLimiteLegible(fechaISO) {
  if (!fechaISO) return '';
  return new Date(`${fechaISO}T00:00:00`)
    .toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })
    .replace(',', '');
}

async function procesarEnvioConfirmacionClaseGratis() {
  if (procesando) return;
  procesando = true;
  try {
    const envio = store.getEnvioConfirmacionClaseGratis();
    if (!envio || envio.estado === 'terminada') return;

    const contenido = store.getContent();
    const yaProcesados = new Set([...(envio.enviadosIds || []), ...(envio.fallidosIds || [])]);
    const pendientes = (envio.registroIds || []).filter((id) => !yaProcesados.has(id));
    const registros = store.getRegistrosClaseGratis();
    const mapaRegistros = new Map(registros.map((r) => [r.id, r]));

    for (const id of pendientes) {
      const registro = mapaRegistros.get(id);
      if (!registro) {
        store.registrarResultadoEnvioConfirmacionClaseGratis(id, false, 'Registro ya no existe');
        continue;
      }
      let exito = false;
      let errorMsg = '';
      try {
        await enviarCorreoConfirmarClaseGratis({
          to: registro.correo,
          nombre: registro.nombre,
          horario: registro.horario,
          fecha: registro.fecha,
          ubicacion: contenido.clasegratis_ubicacion,
          confirmLink: `${SITE_URL}/confirmar-clase?id=${registro.id}&token=${registro.confirmToken}`,
          fechaLimiteLegible: fechaLimiteLegible(contenido.clasegratis_confirmacion_limite),
        });
        exito = true;
      } catch (e) {
        errorMsg = e.message || String(e);
        console.error(`[clase-gratis] Fallo al mandar confirmacion a ${registro.correo}:`, errorMsg);
      }
      store.registrarResultadoEnvioConfirmacionClaseGratis(id, exito, errorMsg);
      // Pausa entre envios para respetar el ritmo de la API de Resend.
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  } finally {
    procesando = false;
  }
}

// Al arrancar el servidor (deploy, reinicio a medio envio) retoma un envio
// sin terminar, con el mismo margen de espera que las campañas de correo
// para que el dueño del sitio pueda cancelar desde /admin si el reinicio
// fue justo por eso.
const ESPERA_INICIAL_MS = 3 * 60 * 1000;
function reanudarEnvioConfirmacionPendiente() {
  setTimeout(() => {
    const envio = store.getEnvioConfirmacionClaseGratis();
    if (envio && envio.estado !== 'terminada') procesarEnvioConfirmacionClaseGratis().catch(() => {});
  }, ESPERA_INICIAL_MS);
}

function fechaISO(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// Recordatorio solo a quien de verdad confirmo su lugar (no a todos los
// registrados) -- mismo criterio de 2 dias antes + el mismo dia que ya
// corre para los talleres pagados.
async function revisarRecordatoriosClaseGratis() {
  const hoy = new Date();
  const fechaHoy = fechaISO(hoy);
  const fechaEn2Dias = fechaISO(new Date(hoy.getTime() + 2 * 24 * 60 * 60 * 1000));
  const contenido = store.getContent();

  const tandas = [
    { campo: 'recordatorio2diasClaseEnviado', fecha: fechaEn2Dias, diasFaltan: 2 },
    { campo: 'recordatorioMismoDiaClaseEnviado', fecha: fechaHoy, diasFaltan: 0 },
  ];
  for (const tanda of tandas) {
    const pendientes = store.getRegistrosClaseGratis().filter(
      (r) => r.confirmado && r.fecha === tanda.fecha && !r[tanda.campo]
    );
    for (const registro of pendientes) {
      try {
        await enviarCorreoRecordatorioClaseGratis({
          to: registro.correo,
          nombre: registro.nombre,
          horario: registro.horario,
          fecha: registro.fecha,
          ubicacion: contenido.clasegratis_ubicacion,
          diasFaltan: tanda.diasFaltan,
          numeroWhatsapp: contenido.whatsapp_numero,
        });
        store.marcarRecordatorioClaseGratisEnviado(registro.id, tanda.campo);
      } catch (e) {
        console.error(`[clase-gratis] No se pudo mandar el recordatorio (${tanda.campo}) a ${registro.correo}:`, e.message);
      }
    }
  }
}

const INTERVALO_MS = 30 * 60 * 1000;
function iniciarAutomatizacionClaseGratis() {
  reanudarEnvioConfirmacionPendiente();
  revisarRecordatoriosClaseGratis().catch(() => {});
  setInterval(() => revisarRecordatoriosClaseGratis().catch(() => {}), INTERVALO_MS);
}

module.exports = { procesarEnvioConfirmacionClaseGratis, iniciarAutomatizacionClaseGratis };
