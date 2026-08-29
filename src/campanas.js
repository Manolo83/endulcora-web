const store = require('./store');
const { SITE_URL } = require('./config');
const { enviarCorreoCampana } = require('./email');

// Manda (o retoma) una campaña de correo masivo contacto por contacto,
// guardando de inmediato quien ya quedo procesado (store.registrarResultadoCampana)
// para que, si el servidor se reinicia a la mitad, se pueda seguir exactamente
// donde se quedo en vez de perder el resto o repetir correos ya enviados.
async function procesarCampana(campanaId) {
  const campana = store.getCampanaCorreo(campanaId);
  if (!campana || campana.estado === 'terminada') return;

  const yaProcesados = new Set([...(campana.enviadosIds || []), ...(campana.fallidosIds || [])]);
  const mapaContactos = new Map(store.getContactosCampana().map((c) => [c.id, c]));
  const pendientes = (campana.contactoIds || [])
    .filter((id) => !yaProcesados.has(id))
    .map((id) => mapaContactos.get(id))
    .filter(Boolean);

  for (const contacto of pendientes) {
    let exito = false;
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
    }
    store.registrarResultadoCampana(campanaId, contacto.id, exito);
    // Pausa entre envios para respetar el ritmo de la API de Resend.
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  store.actualizarCampanaCorreo(campanaId, { estado: 'terminada', terminadaAt: new Date().toISOString() });
}

// Al arrancar el servidor (deploy, reinicio, caida a medias), retoma
// cualquier campaña que se haya quedado sin terminar. Sin esto, un redeploy
// durante un envio grande lo deja congelado para siempre a medio enviar.
function reanudarCampanasPendientes() {
  const pendientes = store.getCampanasCorreo().filter((c) => c.estado !== 'terminada');
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

module.exports = { procesarCampana, reanudarCampanasPendientes };
