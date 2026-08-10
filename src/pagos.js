// Mercado Pago compartido entre el checkout del sitio y el bot de Meta, para
// que un link de pago generado por WhatsApp sea exactamente el mismo pedido
// que uno hecho desde la tienda (misma preferencia, mismo webhook, misma
// entrega automatica por correo).

const { MercadoPagoConfig, Preference } = require('mercadopago');
const { SITE_URL } = require('./config');

function mpClient() {
  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) return null;
  return new MercadoPagoConfig({ accessToken });
}

function parsePrecio(valor) {
  const numero = parseFloat(String(valor).replace(/,/g, ''));
  return Number.isFinite(numero) ? numero : 0;
}

// resueltos: [{ tipo, itemId, titulo, precio, cantidad }]
async function crearPreferencia({ resueltos, email, orderId }) {
  const client = mpClient();
  if (!client) throw new Error('Los pagos todavia no estan configurados.');

  const preference = new Preference(client);
  const resultado = await preference.create({
    body: {
      items: resueltos.map((r) => ({
        id: String(r.itemId),
        title: r.titulo,
        quantity: r.cantidad,
        unit_price: r.precio,
        currency_id: 'MXN',
      })),
      payer: email ? { email } : undefined,
      external_reference: String(orderId),
      back_urls: {
        success: `${SITE_URL}/?pago=exito`,
        failure: `${SITE_URL}/?pago=error`,
        pending: `${SITE_URL}/?pago=pendiente`,
      },
      auto_return: 'approved',
      notification_url: `${SITE_URL}/api/checkout/webhook`,
    },
  });

  // Mercado Pago devuelve tanto init_point como sandbox_init_point sin importar
  // el tipo de credencial usada, asi que no se puede adivinar cual corresponde.
  // Se usa init_point (el real) siempre, salvo que se active explicitamente
  // MP_SANDBOX=true (util solo mientras se prueba con credenciales de prueba).
  const usarSandbox = process.env.MP_SANDBOX === 'true';
  const url = usarSandbox ? (resultado.sandbox_init_point || resultado.init_point) : resultado.init_point;

  return { url, preferenceId: resultado.id };
}

module.exports = { mpClient, parsePrecio, crearPreferencia };
