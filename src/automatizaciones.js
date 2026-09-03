// Correos automaticos que no dependen de una accion del admin: la secuencia
// del lead magnet (receta gratis a cambio del correo) y el recordatorio a
// quien crea una cuenta pero nunca se suscribe a la membresia. Un intervalo
// simple revisa cada cierto tiempo quien tiene un correo pendiente — no hace
// falta una cola de trabajos real para este volumen.
const store = require('./store');
const email = require('./email');
const { SITE_URL } = require('./config');

// Dias de espera entre cada paso de la secuencia (el paso 0, la receta
// gratis, se manda de inmediato al suscribirse desde la propia ruta de
// suscripcion — este modulo solo se encarga de los pasos 1 en adelante).
const DIAS_DESDE_PASO_ANTERIOR = { 1: 2, 2: 3, 3: 3 };
const ULTIMO_PASO = 3;
const CORREOS_LEAD_MAGNET = {
  1: email.enviarCorreoLeadMagnetPaso1,
  2: email.enviarCorreoLeadMagnetPaso2,
  3: email.enviarCorreoLeadMagnetPaso3,
};

const DIAS_RECORDATORIO_MEMBRESIA = 2;

const INTERVALO_MS = 30 * 60 * 1000; // cada 30 minutos es de sobra para esperas de dias

function sumarDias(dias) {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() + dias);
  return fecha.toISOString();
}

function urlDesuscripcion(sub) {
  return `${SITE_URL}/desuscribir-correos?id=${sub.id}&token=${sub.unsubToken}`;
}

// Si el correo ya pertenece a alguien con membresia activa no tiene caso
// seguir insistiendole con la secuencia.
function emailEsDeMiembroActivo(correo) {
  const usuario = store.getUsers().find((u) => u.email === correo);
  return !!usuario && usuario.membresiaEstado === 'activa';
}

async function revisarSecuenciaLeadMagnet() {
  const pendientes = store.getSubscribersParaLeadMagnet();
  for (const sub of pendientes) {
    try {
      if (emailEsDeMiembroActivo(sub.email)) {
        store.updateSubscriber(sub.id, { leadMagnetProximoEnvio: null });
        continue;
      }
      const enviar = CORREOS_LEAD_MAGNET[sub.leadMagnetPaso];
      if (!enviar) {
        store.updateSubscriber(sub.id, { leadMagnetProximoEnvio: null });
        continue;
      }
      await enviar({ to: sub.email, siteUrl: SITE_URL, unsubscribeUrl: urlDesuscripcion(sub) });
      const siguientePaso = sub.leadMagnetPaso + 1;
      const proximo = siguientePaso <= ULTIMO_PASO ? sumarDias(DIAS_DESDE_PASO_ANTERIOR[siguientePaso]) : null;
      store.updateSubscriber(sub.id, { leadMagnetPaso: siguientePaso, leadMagnetProximoEnvio: proximo });
    } catch (e) {
      console.error('No se pudo mandar el correo del lead magnet a', sub.email, e.message);
    }
  }
}

async function revisarRecordatoriosMembresia() {
  const pendientes = store.getUsuariosParaRecordatorioMembresia(DIAS_RECORDATORIO_MEMBRESIA);
  for (const usuario of pendientes) {
    try {
      await email.enviarCorreoRecordatorioMembresia({ to: usuario.email, nombre: usuario.nombre, siteUrl: SITE_URL });
      store.updateUser(usuario.id, { registroRecordatorioEnviado: true });
    } catch (e) {
      console.error('No se pudo mandar el recordatorio de membresia a', usuario.email, e.message);
    }
  }
}

let corriendo = false;
async function revisarAutomatizaciones() {
  if (corriendo) return;
  corriendo = true;
  try {
    await revisarSecuenciaLeadMagnet();
    await revisarRecordatoriosMembresia();
  } catch (e) {
    console.error('Error revisando automatizaciones:', e.message);
  } finally {
    corriendo = false;
  }
}

function iniciarAutomatizaciones() {
  revisarAutomatizaciones();
  setInterval(revisarAutomatizaciones, INTERVALO_MS);
}

module.exports = { iniciarAutomatizaciones, revisarAutomatizaciones };
