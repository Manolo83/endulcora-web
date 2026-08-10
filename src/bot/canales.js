// Envio de mensajes a los tres canales de Meta Business.
//
// WhatsApp usa la Cloud API (endpoint del numero); Messenger e Instagram usan
// la Messenger Platform (endpoint de la pagina). Los tres viven bajo la misma
// app de Meta, por eso comparten webhook y firma.

const GRAPH = process.env.META_GRAPH_VERSION || 'v21.0';
const BASE = `https://graph.facebook.com/${GRAPH}`;

// WhatsApp corta los mensajes largos; ademas un parrafo enorme en el celular no
// se lee. Se parte en trozos por si el modelo se extiende.
const LARGO_MAXIMO = 3500;

function trozos(texto) {
  const limpio = String(texto || '').trim();
  if (!limpio) return [];
  if (limpio.length <= LARGO_MAXIMO) return [limpio];
  const partes = [];
  for (let i = 0; i < limpio.length; i += LARGO_MAXIMO) {
    partes.push(limpio.slice(i, i + LARGO_MAXIMO));
  }
  return partes;
}

function tokenDe(canal) {
  if (canal === 'whatsapp') return process.env.WHATSAPP_TOKEN || '';
  return process.env.META_PAGE_TOKEN || '';
}

function configurado(canal) {
  if (canal === 'whatsapp') {
    return !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
  }
  return !!process.env.META_PAGE_TOKEN;
}

async function llamarGraph(url, cuerpo, token) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(cuerpo),
  });
  if (!res.ok) {
    const detalle = await res.text();
    throw new Error(`Graph API ${res.status}: ${detalle.slice(0, 300)}`);
  }
  return res.json();
}

// Manda texto al contacto. `destino` es el telefono en WhatsApp y el
// scoped id del usuario en Messenger/Instagram.
async function enviarTexto({ canal, destino, texto }) {
  if (!configurado(canal)) {
    console.warn(`[bot] No se envio nada por ${canal}: faltan las variables de entorno.`);
    return;
  }
  const token = tokenDe(canal);

  for (const parte of trozos(texto)) {
    if (canal === 'whatsapp') {
      await llamarGraph(
        `${BASE}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: destino,
          type: 'text',
          text: { preview_url: true, body: parte },
        },
        token
      );
    } else {
      // Messenger e Instagram comparten endpoint y formato.
      await llamarGraph(
        `${BASE}/me/messages`,
        {
          recipient: { id: destino },
          messaging_type: 'RESPONSE',
          message: { text: parte },
        },
        token
      );
    }
  }
}

// Marca el mensaje como leido en WhatsApp (los otros canales no lo soportan
// igual). Es cosmetico: si falla, no interrumpe la respuesta.
async function marcarLeido({ canal, idMensaje }) {
  if (canal !== 'whatsapp' || !configurado('whatsapp') || !idMensaje) return;
  try {
    await llamarGraph(
      `${BASE}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      { messaging_product: 'whatsapp', status: 'read', message_id: idMensaje },
      tokenDe('whatsapp')
    );
  } catch (e) {
    // Sin ruido: no vale la pena fallar una conversacion por la palomita azul.
  }
}

module.exports = { enviarTexto, marcarLeido, configurado };
