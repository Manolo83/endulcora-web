// Webhook unico de Meta Business para WhatsApp, Messenger e Instagram.
//
// Los tres canales cuelgan de la misma app de Meta, asi que llegan aqui con la
// misma firma y se distinguen por el campo `object` del cuerpo. Ademas de los
// mensajes, se atienden dos cosas que traen mucha gente:
//   - los anuncios (Meta manda un `referral` con el id y el titular del
//     anuncio, que dice de que taller preguntan sin tener que adivinarlo);
//   - los comentarios en las publicaciones, que se contestan en publico y en
//     privado para abrir la conversacion.

const express = require('express');
const crypto = require('crypto');
const store = require('../store');
const almacen = require('../bot/almacen');
const agente = require('../bot/agente');
const canales = require('../bot/canales');
const copysBot = require('../bot/copys');
const notificaciones = require('../bot/notificaciones');

const router = express.Router();

// Palabras con las que el cliente se da de baja. Se atienden en codigo, antes
// de gastar un token: es un derecho, no una conversacion.
const PALABRAS_BAJA = ['baja', 'stop', 'darme de baja', 'no quiero mas mensajes'];

// Meta solo deja mandar UN mensaje privado por comentario. Si el saludo mas el
// copy del taller no caben en uno, se manda solo el saludo y el copy sale en
// cuanto la persona conteste.
const LARGO_MAXIMO_PRIVADO = 1900;

function esBaja(texto) {
  const limpio = String(texto || '').trim().toLowerCase();
  return PALABRAS_BAJA.includes(limpio);
}

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
    try {
      if (evento.clase === 'comentario') await procesarComentario(evento);
      else await procesarMensaje(evento);
    } catch (e) {
      // Se nombra a quien iba dirigido: casi todos los fallos de envio son por
      // el numero (formato, lista de permitidos), y sin verlo no se distingue
      // cual de todos fallo.
      console.error(`[bot] Error con un ${evento.clase} de ${evento.canal}/${evento.externoId}:`, e.message);
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

  const config = store.getBotConfig();
  if (!config.activo) return;

  const copys = store.getBotCopys();
  const contacto = await almacen.obtenerOCrearContacto({
    canal: evento.canal,
    externoId: evento.externoId,
    nombre: evento.nombre,
    telefono: '',
  });

  await almacen.guardarMensaje(contacto.id, 'cliente', `(comentario público) ${evento.texto}`);

  // Quien pidio no recibir mensajes no recibe mensajes, ni siquiera por un
  // comentario suyo.
  if (contacto.estado === 'baja') return;

  // El comentario suele decir de que taller preguntan ("info de tamales").
  const taller = store.buscarTallerPorAnuncio({ adId: '', titulo: evento.texto, texto: '' });

  // 1. En publico, corto y amable: lo lee cualquiera que pase por ahi.
  try {
    await canales.responderComentarioPublico({
      canal: evento.canal,
      comentarioId: evento.comentarioId,
      texto: copys.comentario_publico,
    });
    await almacen.guardarMensaje(contacto.id, 'bot', `(respuesta pública) ${copys.comentario_publico}`);
  } catch (e) {
    console.error('[bot] No se pudo responder el comentario en público:', e.message);
  }

  // 2. En privado, que es lo que abre la conversacion. Meta solo permite uno,
  // asi que se manda el saludo con el copy del taller si caben juntos.
  let privado = copys.comentario_privado;
  let copyEnviado = false;
  if (taller) {
    const { texto, hayFechas } = copysBot.copyTaller(taller);
    const junto = `${privado}\n\n${texto}`;
    if (hayFechas && junto.length <= LARGO_MAXIMO_PRIVADO) {
      privado = junto;
      copyEnviado = true;
    }
  }

  try {
    await canales.responderComentarioPrivado({
      canal: evento.canal,
      comentarioId: evento.comentarioId,
      texto: privado,
    });
    await almacen.guardarMensaje(contacto.id, 'bot', privado);

    if (copyEnviado) {
      await almacen.crearSolicitud({ contactoId: contacto.id, tallerBotId: taller.id, taller: taller.nombre });
      // El gancho va aparte, en cuanto la persona conteste: aqui ya se gasto
      // el unico mensaje privado que Meta permite por comentario.
    }
  } catch (e) {
    console.error('[bot] No se pudo mandar el privado del comentario:', e.message);
  }
}

/* ------------------------------- Mensajes ----------------------------- */

async function procesarMensaje(entrante) {
  if (!(await almacen.esEventoNuevo(entrante.idEvento))) return;

  const config = store.getBotConfig();
  const contacto = await almacen.obtenerOCrearContacto({
    canal: entrante.canal,
    externoId: entrante.externoId,
    nombre: entrante.nombre,
    telefono: entrante.telefono,
  });

  const enviar = async (texto) => {
    if (!texto || !texto.trim()) return;
    await canales.enviarTexto({ canal: entrante.canal, destino: entrante.externoId, texto });
    await almacen.guardarMensaje(contacto.id, 'bot', texto);
  };

  // 1. Guardar siempre lo que escribio el cliente, aunque el bot este apagado
  // o la conversacion ya sea de una persona: es el historial que se ve en el
  // panel y el contexto de quien la atienda.
  const textoGuardado =
    entrante.texto ||
    (entrante.tipo === 'arranque'
      ? '(entró desde un anuncio)'
      : `(el cliente envió un ${entrante.tipo})`);
  await almacen.guardarMensaje(contacto.id, 'cliente', textoGuardado);

  // 2. Baja: se atiende siempre, incluso con el bot apagado. Es un derecho.
  if (esBaja(entrante.texto)) {
    await almacen.actualizarContacto(contacto.id, { estado: 'baja', motivoEscalado: 'El cliente pidió no recibir mensajes' });
    await enviar('Listo, no volveré a escribirte por aquí. Si algún día quieres información de nuestros talleres, solo mándanos un mensaje ✨');
    return;
  }

  // 3. Conversaciones que ya son de una persona: el bot no se mete.
  if (contacto.estado !== 'bot') return;

  if (!config.activo) return;

  // 4. Adjuntos: el bot no lee comprobantes ni imagenes, lo dice y entrega.
  if (!entrante.texto && entrante.tipo !== 'arranque') {
    await almacen.actualizarContacto(contacto.id, {
      estado: 'humano',
      motivoEscalado: `El cliente mandó un ${entrante.tipo} (posible comprobante)`,
    });
    await enviar(copysBot.copyRedireccion());
    const mensajes = await almacen.historial(contacto.id, 40);
    notificaciones.avisarEscalado({
      contacto,
      motivo: `Mandó un ${entrante.tipo}. Si es un comprobante, hay que validarlo a mano.`,
      mensajes,
    });
    return;
  }

  await canales.marcarLeido({ canal: entrante.canal, idMensaje: entrante.idEvento });

  // 5. Primer contacto: la bienvenida (con el aviso de privacidad) sale del
  // panel y va antes de cualquier otra cosa que diga el bot.
  if (!(await almacen.yaSaludo(contacto.id))) {
    await enviar(store.getBotCopys().bienvenida);
  }

  // 6. De donde viene: si llego por un anuncio, Meta dice cual. Eso pesa mas
  // que adivinar por el texto, sobre todo cuando no escribio nada.
  const desdeAnuncio = entrante.referral ? store.buscarTallerPorAnuncio(entrante.referral) : null;
  const porPalabra = entrante.texto ? store.buscarTalleresPorPalabra(entrante.texto) : [];

  const pistas = [];
  // Hay claves a proposito repetidas (COCTELES sirve para Cocteleria Basica y
  // para Cocteleria Mexicana). Cuando pasa, el bot pregunta en vez de adivinar.
  if (!desdeAnuncio && porPalabra.length > 1) {
    const opciones = porPalabra.map((t) => `"${t.nombre}" (id ${t.id})`).join(' y ');
    pistas.push(`(Esa palabra clave sirve para dos talleres distintos: ${opciones}. Pregúntale cuál quiere antes de mandar nada.)`);
  }
  if (desdeAnuncio) {
    pistas.push(`(Llegó desde el anuncio "${entrante.referral.titulo || entrante.referral.adId}", que es del taller "${desdeAnuncio.nombre}", id ${desdeAnuncio.id}.)`);
  } else if (entrante.referral) {
    pistas.push('(Llegó desde un anuncio, pero no se pudo identificar de qué taller. Pregúntaselo.)');
  }
  if (porPalabra.length === 1 && !desdeAnuncio) {
    pistas.push(`(El sistema detectó la palabra clave del taller "${porPalabra[0].nombre}", id ${porPalabra[0].id}.)`);
  }
  if (entrante.tipo === 'arranque') {
    pistas.push('(Abrió el chat desde el anuncio sin escribir nada. Salúdalo y mándale la información del taller.)');
  }

  const mensajeCliente = [entrante.texto || '(abrió el chat sin escribir)', ...pistas].join('\n\n');

  const { texto } = await agente.responder({ contacto, mensajeCliente, enviar });
  await enviar(texto);
}

module.exports = router;
