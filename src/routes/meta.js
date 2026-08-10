// Webhook unico de Meta Business para WhatsApp, Messenger e Instagram.
//
// Los tres canales cuelgan de la misma app de Meta, asi que llegan aqui con la
// misma firma y se distinguen por el campo `object` del cuerpo.

const express = require('express');
const crypto = require('crypto');
const store = require('../store');
const almacen = require('../bot/almacen');
const agente = require('../bot/agente');
const canales = require('../bot/canales');

const router = express.Router();

// Palabras con las que el cliente se da de baja. Se atienden en codigo, antes
// de gastar un token: es un derecho, no una conversacion.
const PALABRAS_BAJA = ['baja', 'stop', 'darme de baja', 'no quiero mas mensajes'];

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

// Cada canal manda una forma distinta. Aqui se aplanan a una sola.
function extraerMensajes(cuerpo) {
  const salida = [];

  for (const entry of cuerpo.entry || []) {
    // WhatsApp Cloud API
    for (const cambio of entry.changes || []) {
      const valor = cambio.value || {};
      const perfiles = valor.contacts || [];
      for (const mensaje of valor.messages || []) {
        const perfil = perfiles.find((c) => c.wa_id === mensaje.from) || perfiles[0];
        salida.push({
          canal: 'whatsapp',
          idMensaje: mensaje.id,
          externoId: mensaje.from,
          telefono: mensaje.from,
          nombre: (perfil && perfil.profile && perfil.profile.name) || '',
          texto: mensaje.type === 'text' ? (mensaje.text && mensaje.text.body) || '' : '',
          tipo: mensaje.type,
        });
      }
    }

    // Messenger e Instagram (Messenger Platform)
    for (const evento of entry.messaging || []) {
      const mensaje = evento.message || {};
      // Los echo son los mensajes que manda la propia pagina: ignorarlos evita
      // que el bot se responda a si mismo.
      if (mensaje.is_echo) continue;
      if (!evento.sender || !evento.sender.id) continue;
      salida.push({
        canal: cuerpo.object === 'instagram' ? 'instagram' : 'messenger',
        idMensaje: mensaje.mid,
        externoId: evento.sender.id,
        telefono: '',
        nombre: '',
        texto: mensaje.text || '',
        tipo: mensaje.text ? 'text' : 'otro',
      });
    }
  }

  return salida;
}

/* ------------------------------ Recepcion ----------------------------- */

router.post('/webhook', (req, res) => {
  if (!firmaValida(req)) return res.sendStatus(403);

  // Meta exige un 200 rapido: si tarda, reintenta y degrada la calidad del
  // numero. Se responde de inmediato y se procesa despues.
  res.sendStatus(200);

  const cuerpo = req.body || {};
  setImmediate(() => {
    procesarLote(cuerpo).catch((e) => console.error('[bot] Error procesando el webhook:', e.message));
  });
});

async function procesarLote(cuerpo) {
  for (const entrante of extraerMensajes(cuerpo)) {
    try {
      await procesarMensaje(entrante);
    } catch (e) {
      console.error('[bot] Error con un mensaje entrante:', e.message);
    }
  }
}

async function procesarMensaje(entrante) {
  if (!(await almacen.esEventoNuevo(entrante.idMensaje))) return;

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
  await almacen.guardarMensaje(contacto.id, 'cliente', entrante.texto || `(el cliente envió un ${entrante.tipo})`);

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
  if (!entrante.texto) {
    await almacen.actualizarContacto(contacto.id, {
      estado: 'humano',
      motivoEscalado: `El cliente mandó un ${entrante.tipo} (posible comprobante)`,
    });
    await enviar(store.getBotCopys().redireccion);
    const mensajes = await almacen.historial(contacto.id, 40);
    require('../bot/notificaciones').avisarEscalado({
      contacto,
      motivo: `Mandó un ${entrante.tipo}. Si es un comprobante, hay que validarlo a mano.`,
      mensajes,
    });
    return;
  }

  await canales.marcarLeido({ canal: entrante.canal, idMensaje: entrante.idMensaje });

  // 5. Primer contacto: la bienvenida (con el aviso de privacidad) sale del
  // panel y va antes de cualquier otra cosa que diga el bot.
  if (!(await almacen.yaSaludo(contacto.id))) {
    await enviar(store.getBotCopys().bienvenida);
  }

  // 6. Atajo por palabra clave: si escribio PAYS, GALLETAS, etc., no hace falta
  // que el modelo lo adivine.
  const tallerPorPalabra = store.buscarTallerPorPalabra(entrante.texto);
  const pista = tallerPorPalabra
    ? `${entrante.texto}\n\n(El sistema detectó la palabra clave del taller "${tallerPorPalabra.nombre}", id ${tallerPorPalabra.id}.)`
    : entrante.texto;

  const { texto } = await agente.responder({ contacto, mensajeCliente: pista, enviar });
  await enviar(texto);
}

module.exports = router;
