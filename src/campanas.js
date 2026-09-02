const store = require('./store');
const { SITE_URL } = require('./config');
const { enviarCorreoCampana } = require('./email');

// Sin ramp-up: por decision del negocio, cada campaña manda a todos sus
// contactos de una sola vez (sin repartir el envio en varios dias). El
// unico limite que queda es la pausa entre cada correo, mas abajo, para no
// saturar la API de Resend.
function limiteAcumuladoDeHoy() {
  return Infinity;
}

// Evita que la misma campaña se procese dos veces al mismo tiempo (ej. el
// chequeo por hora se traslapa con un envio que ya viene corriendo).
const procesandoActualmente = new Set();

// Manda (o retoma) una campaña de correo masivo contacto por contacto,
// guardando de inmediato quien ya quedo procesado
// (store.registrarResultadoCampana) para que, si el servidor se reinicia a
// la mitad, se pueda seguir exactamente donde se quedo en vez de perder el
// resto o repetir correos ya enviados.
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
    // Si el servidor se reinicia a la mitad del envio, la campaña se queda
    // "enviando": el chequeo periodico (o el proximo arranque del
    // servidor) la retoma sola, sin que haya que hacer nada a mano.
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
