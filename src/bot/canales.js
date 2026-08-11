// Envio de mensajes a los tres canales de Meta Business.
//
// WhatsApp usa la Cloud API (endpoint del numero); Messenger e Instagram usan
// la Messenger Platform (endpoint de la pagina). Los tres viven bajo la misma
// app de Meta, por eso comparten webhook y firma.

const GRAPH = process.env.META_GRAPH_VERSION || 'v21.0';
// META_GRAPH_BASE existe para poder probar el envio contra un servidor de
// mentiras. En produccion se deja sin definir y apunta a Meta.
const BASE = process.env.META_GRAPH_BASE || `https://graph.facebook.com/${GRAPH}`;

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

// Herencia de cuando los celulares mexicanos llevaban un 1 despues de la lada.
// WhatsApp todavia REPORTA los numeros de Mexico como 521 + 10 digitos cuando
// entra un mensaje, pero al ENVIAR solo acepta 52 + 10. Si se contesta al
// numero tal como llego, Meta responde que el destinatario no existe.
//
// Argentina arrastra lo mismo con el 9 (549 + 10). Se corrigen los dos.
function normalizarDestino(canal, destino) {
  if (canal !== 'whatsapp') return destino;
  const digitos = String(destino || '').replace(/\D/g, '');
  if (/^521\d{10}$/.test(digitos)) return '52' + digitos.slice(3);
  if (/^549\d{10}$/.test(digitos)) return '54' + digitos.slice(3);
  return digitos;
}

function tokenDe(canal) {
  if (canal === 'whatsapp') return process.env.WHATSAPP_TOKEN || '';
  return process.env.META_PAGE_TOKEN || '';
}

// Messenger e Instagram publican bajo la pagina de Facebook. Con un token de
// pagina, "me" ya apunta ahi; pero con un token de usuario del sistema (el
// permanente, el que no caduca) "me" seria el usuario del sistema y el envio
// falla. Nombrar la pagina explicitamente funciona con los dos.
function nodoPagina() {
  return process.env.META_PAGE_ID || 'me';
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
  const para = normalizarDestino(canal, destino);

  for (const parte of trozos(texto)) {
    if (canal === 'whatsapp') {
      await llamarGraph(
        `${BASE}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: para,
          type: 'text',
          text: { preview_url: true, body: parte },
        },
        token
      );
    } else {
      // Messenger e Instagram comparten endpoint y formato.
      await llamarGraph(
        `${BASE}/${nodoPagina()}/messages`,
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

/* ----------------------------- Comentarios ----------------------------- */
//
// Un comentario se contesta en dos lugares: en publico debajo del comentario
// (lo lee quien pase por la publicacion) y en privado, que es lo que abre la
// conversacion y mete a esa persona al embudo.
//
// Meta solo permite UNA respuesta privada por comentario, asi que este camino
// no se puede reintentar a la ligera.

async function responderComentarioPublico({ canal, comentarioId, texto }) {
  if (!configurado(canal) || !texto || !texto.trim()) return;
  // Facebook responde al comentario con /comments; Instagram con /replies.
  const ruta = canal === 'instagram' ? 'replies' : 'comments';
  await llamarGraph(`${BASE}/${comentarioId}/${ruta}`, { message: texto.trim() }, tokenDe(canal));
}

async function responderComentarioPrivado({ canal, comentarioId, texto }) {
  if (!configurado(canal) || !texto || !texto.trim()) return;

  if (canal === 'instagram') {
    // En Instagram el privado se manda por la API de mensajes, apuntando al
    // comentario como destinatario.
    await llamarGraph(
      `${BASE}/${nodoPagina()}/messages`,
      { recipient: { comment_id: comentarioId }, message: { text: texto.trim() } },
      tokenDe(canal)
    );
    return;
  }

  await llamarGraph(`${BASE}/${comentarioId}/private_replies`, { message: texto.trim() }, tokenDe(canal));
}

module.exports = {
  enviarTexto,
  marcarLeido,
  configurado,
  responderComentarioPublico,
  responderComentarioPrivado,
};
