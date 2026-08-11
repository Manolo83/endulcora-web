// Webhook de Meta Business para los comentarios de Facebook e Instagram.
//
// El bot contesta comentarios y nada mas: responde la duda con datos reales y
// manda a la persona al WhatsApp de Endulcora, donde la atiende alguien de
// verdad. Los mensajes directos no se tocan; se quedan en la bandeja de Meta.
//
// Los dos canales cuelgan de la misma app, asi que llegan aqui con la misma
// firma y se distinguen por el campo `object` del cuerpo.

const express = require('express');
const crypto = require('crypto');
const store = require('../store');
const almacen = require('../bot/almacen');
const agente = require('../bot/agente');
const canales = require('../bot/canales');
const copysBot = require('../bot/copys');
const notificaciones = require('../bot/notificaciones');

const router = express.Router();

/* ---------------------------- Verificacion ---------------------------- */

// Meta llama con GET una sola vez, al dar de alta el webhook en el panel.
router.get('/webhook', (req, res) => {
  const token = process.env.META_VERIFY_TOKEN;
  if (
    token &&
    req.query['hub.mode'] === 'subscribe' &&
    req.query['hub.verify_token'] === token
  ) {
    return res.status(200).send(req.query['hub.challenge']);
  }
  res.sendStatus(403);
});

// Sin esto, cualquiera que conozca la URL puede inyectar conversaciones falsas.
function firmaValida(req) {
  const secreto = process.env.META_APP_SECRET;
  const firma = req.get('x-hub-signature-256');
  if (!secreto || !firma || !req.rawBody) return false;

  const esperada = 'sha256=' + crypto.createHmac('sha256', secreto).update(req.rawBody).digest('hex');
  const a = Buffer.from(firma);
  const b = Buffer.from(esperada);
  // Comparacion en tiempo constante: timingSafeEqual exige el mismo largo.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ---------------------------- Normalizacion --------------------------- */

// El `referral` viene con distinta forma en cada canal. Aqui se deja en una:
// { adId, titulo, texto }.
function referralDeWhatsApp(referral) {
  if (!referral) return null;
  return {
    adId: referral.source_id || '',
    titulo: referral.headline || '',
    texto: referral.body || '',
  };
}

function referralDeMessenger(referral) {
  if (!referral) return null;
  const contexto = referral.ads_context_data || {};
  return {
    adId: referral.ad_id || '',
    titulo: contexto.ad_title || '',
    // `ref` es el parametro que se configura en el anuncio; suele traer el
    // nombre del taller cuando quien arma la campana lo pone.
    texto: referral.ref || '',
  };
}

// Cada canal manda una forma distinta. Aqui se aplanan a una sola.
function extraerEventos(cuerpo) {
  const salida = [];
  const esInstagram = cuerpo.object === 'instagram';

  for (const entry of cuerpo.entry || []) {
    // El id de la entrada es la pagina (o la cuenta de Instagram). Sirve para
    // no contestarnos a nosotros mismos.
    const idPropio = String(entry.id || '');

    for (const cambio of entry.changes || []) {
      const valor = cambio.value || {};

      // --- WhatsApp Cloud API ---
      if (cambio.field === 'messages' || valor.messaging_product === 'whatsapp') {
        const perfiles = valor.contacts || [];
        for (const mensaje of valor.messages || []) {
          const perfil = perfiles.find((c) => c.wa_id === mensaje.from) || perfiles[0];
          salida.push({
            clase: 'mensaje',
            canal: 'whatsapp',
            idEvento: mensaje.id,
            externoId: mensaje.from,
            telefono: mensaje.from,
            nombre: (perfil && perfil.profile && perfil.profile.name) || '',
            texto: mensaje.type === 'text' ? (mensaje.text && mensaje.text.body) || '' : '',
            tipo: mensaje.type,
            referral: referralDeWhatsApp(mensaje.referral),
          });
        }
        continue;
      }

      // --- Comentarios de Facebook ---
      if (cambio.field === 'feed' && valor.item === 'comment' && valor.verb === 'add') {
        salida.push({
          clase: 'comentario',
          canal: 'messenger',
          idEvento: valor.comment_id,
          comentarioId: valor.comment_id,
          externoId: (valor.from && valor.from.id) || '',
          nombre: (valor.from && valor.from.name) || '',
          texto: valor.message || '',
          idPropio,
          contexto: valor.post_id || '',
        });
        continue;
      }

      // --- Comentarios de Instagram ---
      if (cambio.field === 'comments') {
        salida.push({
          clase: 'comentario',
          canal: 'instagram',
          idEvento: valor.id,
          comentarioId: valor.id,
          externoId: (valor.from && valor.from.id) || '',
          nombre: (valor.from && valor.from.username) || '',
          texto: valor.text || '',
          idPropio,
          contexto: (valor.media && valor.media.id) || '',
        });
        continue;
      }
    }

    // --- Messenger e Instagram (Messenger Platform) ---
    for (const evento of entry.messaging || []) {
      const mensaje = evento.message || {};
      // Los echo son los mensajes que manda la propia pagina: ignorarlos evita
      // que el bot se responda a si mismo.
      if (mensaje.is_echo) continue;
      if (!evento.sender || !evento.sender.id) continue;

      // Un anuncio puede llegar de tres formas: dentro del mensaje, como
      // referral suelto (abrio el chat sin escribir) o dentro de un postback
      // (toco el boton de inicio).
      const referralCrudo =
        mensaje.referral || evento.referral || (evento.postback && evento.postback.referral) || null;

      const hayTexto = !!mensaje.text;
      const esArranqueSinTexto = !hayTexto && !!(evento.referral || evento.postback);
      // Sin texto y sin arranque solo queda un adjunto (foto, audio, sticker).
      if (!hayTexto && !esArranqueSinTexto && !mensaje.attachments) continue;

      salida.push({
        clase: 'mensaje',
        canal: esInstagram ? 'instagram' : 'messenger',
        idEvento: mensaje.mid || (evento.postback && evento.postback.mid) || `${evento.sender.id}:${evento.timestamp}`,
        externoId: evento.sender.id,
        telefono: '',
        nombre: '',
        texto: mensaje.text || '',
        tipo: hayTexto ? 'text' : esArranqueSinTexto ? 'arranque' : 'adjunto',
        referral: referralDeMessenger(referralCrudo),
      });
    }
  }

  return salida;
}

/* ------------------------------ Recepcion ----------------------------- */

// Un webhook rechazado en silencio es indistinguible de uno que nunca llego:
// desde el panel de Meta todo se ve bien y aqui no aparece nada. Por eso se
// deja constancia en el log, con la causa concreta y sin inundarlo (Meta
// reintenta muy seguido).
let ultimoAvisoFirma = 0;
function avisarFirmaInvalida(req) {
  if (Date.now() - ultimoAvisoFirma < 60000) return;
  ultimoAvisoFirma = Date.now();

  if (!process.env.META_APP_SECRET) {
    console.error('[bot] Webhook rechazado: falta la variable META_APP_SECRET. Meta si esta tocando, pero no hay con que verificar la firma.');
  } else if (!req.get('x-hub-signature-256')) {
    console.error('[bot] Webhook rechazado: la peticion no trae firma. No viene de Meta.');
  } else {
    console.error('[bot] Webhook rechazado: la firma no coincide. META_APP_SECRET no es la clave secreta de esta app de Meta.');
  }
}

router.post('/webhook', (req, res) => {
  if (!firmaValida(req)) {
    avisarFirmaInvalida(req);
    return res.sendStatus(403);
  }

  // Meta exige un 200 rapido: si tarda, reintenta y degrada la calidad del
  // numero. Se responde de inmediato y se procesa despues.
  res.sendStatus(200);

  const cuerpo = req.body || {};
  setImmediate(() => {
    procesarLote(cuerpo).catch((e) => console.error('[bot] Error procesando el webhook:', e.message));
  });
});

async function procesarLote(cuerpo) {
  const eventos = extraerEventos(cuerpo);
  // Una linea por lote: con esto se distingue "Meta no manda nada" de "manda
  // algo que no sabemos leer", que se ven igual desde el panel.
  console.log(`[bot] Webhook de ${cuerpo.object || 'origen desconocido'}: ${eventos.length} evento(s).`);

  for (const evento of eventos) {
    // El bot solo contesta comentarios. Los mensajes directos de Messenger e
    // Instagram siguen llegando a la bandeja de Meta y los contesta una
    // persona: aqui no se guardan ni se responden, a proposito.
    if (evento.clase !== 'comentario') continue;
    try {
      await procesarComentario(evento);
    } catch (e) {
      // Se nombra a quien iba dirigido: casi todos los fallos de envio son por
      // el numero (formato, lista de permitidos), y sin verlo no se distingue
      // cual de todos fallo.
      console.error(`[bot] Error con un comentario de ${evento.canal}/${evento.externoId}:`, e.message);
    }
  }
}

/* ----------------------------- Comentarios ---------------------------- */

// Ids de la propia pagina y de la cuenta de Instagram, para no contestar los
// comentarios que deja el mismo Endulcorito (y quedarse en un bucle).
function esComentarioPropio(evento) {
  const propios = [evento.idPropio, process.env.META_PAGE_ID, process.env.META_IG_ID]
    .map((v) => String(v || ''))
    .filter(Boolean);
  return propios.includes(String(evento.externoId));
}

async function procesarComentario(evento) {
  if (!evento.comentarioId || !evento.externoId) return;
  if (esComentarioPropio(evento)) return;
  if (!(await almacen.esEventoNuevo(`comentario:${evento.idEvento}`))) return;

  if (!store.getBotConfig().activo) return;

  const contacto = await almacen.obtenerOCrearContacto({
    canal: evento.canal,
    externoId: evento.externoId,
    nombre: evento.nombre,
    telefono: '',
  });

  await almacen.guardarMensaje(contacto.id, 'cliente', `(comentario) ${evento.texto}`);

  // Quien pidio no recibir mensajes no recibe mensajes, ni siquiera por un
  // comentario suyo.
  if (contacto.estado === 'baja') return;

  // 1. El modelo redacta SOLO la respuesta a la duda, con los datos reales de
  // los talleres. El saludo, el cierre y la liga los pone el codigo.
  // Si el modelo falla o no esta configurado se sigue de largo con la respuesta
  // vacia: el saludo y el cierre solos ya son un mensaje util, y dejar un
  // comentario sin contestar es peor que contestarlo corto.
  const { respuesta, motivoEscalado, sinConfigurar } = await agente.responderComentario({
    canal: evento.canal,
    nombre: evento.nombre,
    comentario: evento.texto,
  });
  if (sinConfigurar) {
    console.warn('[bot] Falta GEMINI_API_KEY: el comentario se contesta solo con los copys.');
  }

  // 2. En publico, corto y amable: lo lee cualquiera que pase por ahi.
  const publico = copysBot.copyComentarioPublico();
  try {
    await canales.responderComentarioPublico({
      canal: evento.canal,
      comentarioId: evento.comentarioId,
      texto: publico,
    });
    await almacen.guardarMensaje(contacto.id, 'bot', `(respuesta pública) ${publico}`);
  } catch (e) {
    console.error('[bot] No se pudo responder el comentario en público:', e.message);
  }

  // 3. En privado va la respuesta de verdad. Meta solo permite UNO por
  // comentario, asi que este mensaje es la unica oportunidad: por eso lleva
  // siempre la liga de WhatsApp, aunque el modelo no haya logrado contestar.
  const privado = copysBot.copyComentarioPrivado(respuesta);
  try {
    await canales.responderComentarioPrivado({
      canal: evento.canal,
      comentarioId: evento.comentarioId,
      texto: privado,
    });
    await almacen.guardarMensaje(contacto.id, 'bot', privado);
  } catch (e) {
    console.error('[bot] No se pudo mandar el privado del comentario:', e.message);
  }

  // 4. Lo que el bot no supo contestar lo ve una persona.
  if (motivoEscalado) {
    await almacen.actualizarContacto(contacto.id, { estado: 'humano', motivoEscalado });
    const mensajes = await almacen.historial(contacto.id, 40);
    notificaciones.avisarEscalado({ contacto, motivo: motivoEscalado, mensajes });
  }
}

module.exports = router;
