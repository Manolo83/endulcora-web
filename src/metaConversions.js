const crypto = require('crypto');
const { META_PIXEL_ID, META_CAPI_TOKEN, META_CAPI_TEST_CODE } = require('./config');

// Version soportada de la Graph API al momento de escribir esto. Meta da
// soporte a cada version por ~2 anios, asi que sigue siendo valida aunque no
// sea la mas reciente; si quieres usar una mas nueva, solo cambia este numero.
const GRAPH_API_VERSION = 'v21.0';

function sha256(valor) {
  return crypto.createHash('sha256').update(String(valor).trim().toLowerCase()).digest('hex');
}

// Manda el evento Purchase por la API de Conversiones de Meta, como respaldo
// del Purchase que ya se dispara desde el navegador en /gracias. Usa el mismo
// event_id (orden-<id>) en ambos lados para que Meta los desduplique como una
// sola venta, no dos.
//
// Nunca lanza: si falta configuracion o la llamada falla, solo registra en
// consola y regresa. La medicion nunca debe frenar ni romper una venta.
async function enviarPurchaseCAPI({ order, siteUrl }) {
  if (!META_PIXEL_ID || !META_CAPI_TOKEN) {
    console.log('[meta-capi] META_PIXEL_ID o META_CAPI_TOKEN no configurados; se omite el envio del Purchase por servidor.');
    return;
  }

  try {
    const userData = {};
    if (order.email) userData.em = [sha256(order.email)];
    if (order.fbp) userData.fbp = order.fbp;
    if (order.fbc) userData.fbc = order.fbc;

    const evento = {
      event_name: 'Purchase',
      event_time: Math.floor(Date.now() / 1000),
      event_id: `orden-${order.id}`,
      action_source: 'website',
      event_source_url: `${siteUrl}/gracias?orden=${order.id}`,
      user_data: userData,
      custom_data: {
        value: order.total,
        currency: 'MXN',
        content_ids: (order.items || []).map((item) => String(item.itemId)),
        content_type: 'product',
      },
    };

    const body = { data: [evento] };
    if (META_CAPI_TEST_CODE) body.test_event_code = META_CAPI_TEST_CODE;

    const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${META_PIXEL_ID}/events?access_token=${encodeURIComponent(META_CAPI_TOKEN)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error(`[meta-capi] Meta rechazo el evento del pedido ${order.id}:`, JSON.stringify(data.error || data), data.error && data.error.fbtrace_id ? `fbtrace_id=${data.error.fbtrace_id}` : '');
      return;
    }
    console.log(`[meta-capi] Purchase del pedido ${order.id} enviado (event_id=orden-${order.id}).`, JSON.stringify(data));
  } catch (err) {
    console.error(`[meta-capi] No se pudo enviar el Purchase del pedido ${order.id}:`, err.message);
  }
}

module.exports = { enviarPurchaseCAPI };
