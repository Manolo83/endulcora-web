const store = require('./store');
const { SITE_URL } = require('./config');
const { enviarCorreoCampana } = require('./email');

// "Ramp-up" de reputación: un dominio que de la nada manda miles de correos
// de golpe hace que Gmail/Outlook filtren buena parte (aceptan el correo —
// por eso Resend lo marca "Entregado" — pero lo descartan despues, sin que
// se note). Mandando cada vez mas por dia, el dominio va ganando confianza.
// Indice 0 = dia en que se crea la campaña, indice 1 = el dia siguiente, etc.
// De ahi en adelante (una vez pasados estos dias) ya no hay limite.
const RAMPA_DIARIA = [1000, 2000, 4000];

function diaISO(fecha) {
  return new Date(fecha).toISOString().slice(0, 10);
}

function diasTranscurridos(desde, hasta) {
  const msPorDia = 24 * 60 * 60 * 1000;
  const inicio = new Date(diaISO(desde) + 'T00:00:00Z').getTime();
  const fin = new Date(diaISO(hasta) + 'T00:00:00Z').getTime();
  return Math.max(0, Math.round((fin - inicio) / msPorDia));
}

// Cuantos contactos, en total (acumulado, no por dia), se pueden haber
// procesado ya a estas alturas de la campaña.
function limiteAcumuladoDeHoy(fechaInicio) {
  const dia = diasTranscurridos(fechaInicio, new Date());
  if (dia >= RAMPA_DIARIA.length) return Infinity;
  let acumulado = 0;
  for (let i = 0; i <= dia; i++) acumulado += RAMPA_DIARIA[i];
  return acumulado;
}

// Evita que la misma campaña se procese dos veces al mismo tiempo (ej. el
// chequeo por hora se traslapa con un envio que ya viene corriendo).
const procesandoActualmente = new Set();

// Manda (o retoma) una campaña de correo masivo contacto por contacto,
// respetando el limite diario de arriba, y guardando de inmediato quien ya
// quedo procesado (store.registrarResultadoCampana) para que, si el
// servidor se reinicia a la mitad, se pueda seguir exactamente donde se
// quedo en vez de perder el resto o repetir correos ya enviados.
async function procesarCampana(campanaId) {
  if (procesandoActualmente.has(campanaId)) return;
  procesandoActualmente.add(campanaId);
  try {
    const campana = store.getCampanaCorreo(campanaId);
    if (!campana || campana.estado === 'terminada' || campana.estado === 'cancelada') return;

    const yaProcesados = new Set([...(campana.enviadosIds || []), ...(campana.fallidosIds || [])]);
    const mapaContactos = new Map(store.getContactosCampana().map((c) => [c.id, c]));
    const pendientesTotal = (campana.contactoIds || []).filter((id) => !yaProcesados.has(id));

    if (!pendientesTotal.length) {
      store.actualizarCampanaCorreo(campanaId, { estado: 'terminada', terminadaAt: new Date().toISOString() });
      return;
    }

    const limiteHoy = limiteAcumuladoDeHoy(campana.createdAt);
    const disponiblesHoy = Math.max(0, limiteHoy - yaProcesados.size);
    const paraProcesar = pendientesTotal
      .slice(0, disponiblesHoy)
      .map((id) => mapaContactos.get(id))
      .filter(Boolean);

    for (const contacto of paraProcesar) {
      let exito = false;
      let errorMsg = '';
      try {
        const unsubscribeUrl = `${SITE_URL}/desuscribir?id=${contacto.id}&token=${contacto.unsubToken}`;
        await enviarCorreoCampana({
          to: contacto.email,
          nombre: contacto.nombre,
          asunto: campana.asunto,
          cuerpoHtml: campana.cuerpoHtml,
          unsubscribeUrl,
          imagenes: campana.imagenes,
          archivos: campana.archivos,
          videoUrl: campana.videoUrl,
        });
        exito = true;
      } catch (e) {
        exito = false;
        errorMsg = e.message || String(e);
        console.error(`[campanas] Fallo al enviar a ${contacto.email}:`, errorMsg);
      }
      store.registrarResultadoCampana(campanaId, contacto.id, exito, errorMsg);
      // Pausa entre envios para respetar el ritmo de la API de Resend.
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    const totalProcesadosAhora = yaProcesados.size + paraProcesar.length;
    if (totalProcesadosAhora >= (campana.contactoIds || []).length) {
      store.actualizarCampanaCorreo(campanaId, { estado: 'terminada', terminadaAt: new Date().toISOString() });
    }
    // Si todavia quedan pendientes porque se llego al limite del dia, la
    // campaña se queda "enviando": el chequeo periodico (o el proximo
    // arranque del servidor) la retoma en cuanto el limite del dia
    // siguiente lo permita, sin que haya que hacer nada a mano.
  } finally {
    procesandoActualmente.delete(campanaId);
  }
}

function procesarTodasLasPendientes() {
  const pendientes = store.getCampanasCorreo().filter((c) => c.estado !== 'terminada' && c.estado !== 'cancelada');
  for (const campana of pendientes) {
    if (!Array.isArray(campana.contactoIds) || !campana.contactoIds.length) {
      // Campañas de antes de este cambio no guardaron el contenido ni la
      // lista completa: no se pueden retomar de forma segura (no sabemos a
      // quien exactamente ya se le mando), asi que se marcan como
      // terminadas para no dejarlas "enviando" para siempre.
      store.actualizarCampanaCorreo(campana.id, { estado: 'terminada', terminadaAt: new Date().toISOString() });
      continue;
    }
    procesarCampana(campana.id).catch(() => {});
  }
}

// Al arrancar el servidor (deploy, reinicio, caida a medias) retoma
// cualquier campaña sin terminar, y despues sigue revisando cada hora por
// si alguna esta esperando a que se abra el limite del dia siguiente.
//
// La primera vez que arranca el proceso espera unos minutos antes de
// retomar nada: le da tiempo al administrador de entrar a /admin y
// cancelar una campaña si el reinicio fue justo por eso (ej. se detecto
// que se estaba mandando de mas por error) — sin este margen, el envio
// se reanudaria solo, de inmediato, antes de que le diera tiempo de darle
// "Cancelar".
const ESPERA_INICIAL_MS = 3 * 60 * 1000;
function reanudarCampanasPendientes() {
  setTimeout(procesarTodasLasPendientes, ESPERA_INICIAL_MS);
  setInterval(procesarTodasLasPendientes, 60 * 60 * 1000);
}

module.exports = { procesarCampana, reanudarCampanasPendientes };
