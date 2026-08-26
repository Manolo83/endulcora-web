const express = require('express');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
const store = require('../store');
const { SITE_URL, UPLOAD_DIR } = require('../config');
const { enviarCorreoConfirmacionCompra } = require('../email');
const { enviarPurchaseCAPI } = require('../metaConversions');
const { enviarCompraGoogle } = require('../googleAds/conversiones');

const router = express.Router();

const MAX_ARTICULOS = 15;
const MAX_CANTIDAD_POR_ARTICULO = 20;

function mpClient() {
  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) return null;
  return new MercadoPagoConfig({ accessToken });
}

function parsePrecio(valor) {
  const numero = parseFloat(String(valor).replace(/,/g, ''));
  return Number.isFinite(numero) ? numero : 0;
}

router.post('/preference', async (req, res) => {
  const client = mpClient();
  if (!client) return res.status(503).json({ error: 'Los pagos todavia no estan configurados.' });

  const { items: pedido, email, fbp, fbc, gclid, gbraid, wbraid } = req.body || {};
  if (!Array.isArray(pedido) || pedido.length === 0) {
    return res.status(400).json({ error: 'Tu carrito esta vacio.' });
  }
  if (pedido.length > MAX_ARTICULOS) {
    return res.status(400).json({ error: 'Demasiados artículos distintos en un solo pedido.' });
  }

  const userId = req.session && req.session.userId ? req.session.userId : null;
  const usuario = userId ? store.getUserById(userId) : null;
  const esMiembroActivo = !!(usuario && usuario.membresiaEstado === 'activa');

  const resueltos = [];
  for (const linea of pedido) {
    if (!['producto', 'curso'].includes(linea.tipo) || !linea.id) {
      return res.status(400).json({ error: 'Uno de los artículos del carrito no es valido.' });
    }
    const cantidad = Math.max(1, Math.min(MAX_CANTIDAD_POR_ARTICULO, parseInt(linea.cantidad, 10) || 1));
    const item = linea.tipo === 'producto' ? store.getProduct(linea.id) : store.getCurso(linea.id);
    if (!item) {
      return res.status(404).json({ error: `"${linea.titulo || 'Un artículo'}" ya no esta disponible.` });
    }
    // El precio de membresia (si el producto tiene uno) solo se usa cuando
    // la sesion actual es realmente de un cliente con membresia activa —
    // nunca se confia en nada que mande el carrito del navegador.
    const usarPrecioMiembro = esMiembroActivo && item.precioMembresia && parsePrecio(item.precioMembresia) > 0;
    const precio = usarPrecioMiembro ? parsePrecio(item.precioMembresia) : parsePrecio(item.precio);
    if (precio <= 0) continue;
    resueltos.push({ tipo: linea.tipo, itemId: item.id, titulo: item.titulo, precio, cantidad });
  }

  if (!resueltos.length) {
    return res.status(400).json({ error: 'No hay artículos validos en tu carrito.' });
  }

  const total = resueltos.reduce((acc, r) => acc + r.precio * r.cantidad, 0);
  const viewToken = crypto.randomBytes(24).toString('hex');
  const order = store.addOrder({
    items: resueltos,
    total,
    email: email || (usuario ? usuario.email : ''),
    userId,
    viewToken,
    fbp: typeof fbp === 'string' ? fbp.slice(0, 200) : null,
    fbc: typeof fbc === 'string' ? fbc.slice(0, 200) : null,
    // Identificadores del clic en un anuncio de Google (gclid en buscador y
    // display; gbraid/wbraid cuando el clic viene de una app o de iOS).
    gclid: typeof gclid === 'string' ? gclid.slice(0, 200) : null,
    gbraid: typeof gbraid === 'string' ? gbraid.slice(0, 200) : null,
    wbraid: typeof wbraid === 'string' ? wbraid.slice(0, 200) : null,
  });

  try {
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
        external_reference: String(order.id),
        back_urls: {
          success: `${SITE_URL}/gracias?orden=${order.id}&token=${viewToken}`,
          failure: `${SITE_URL}/?pago=error`,
          pending: `${SITE_URL}/gracias?orden=${order.id}&token=${viewToken}`,
        },
        auto_return: 'approved',
        notification_url: `${SITE_URL}/api/checkout/webhook`,
      },
    });

    store.updateOrder(order.id, { mpPreferenceId: resultado.id });
    // Mercado Pago devuelve tanto init_point como sandbox_init_point sin
    // importar el tipo de credencial usada, asi que no se puede adivinar
    // cual corresponde. Se usa init_point (el real) siempre, salvo que se
    // active explicitamente MP_SANDBOX=true en las variables de entorno
    // (util solo mientras se prueba con credenciales de prueba).
    const usarSandbox = process.env.MP_SANDBOX === 'true';
    const url = usarSandbox ? (resultado.sandbox_init_point || resultado.init_point) : resultado.init_point;
    res.status(201).json({ url });
  } catch (err) {
    store.updateOrder(order.id, { estado: 'error' });
    res.status(502).json({ error: 'No se pudo iniciar el pago. Intenta de nuevo en un momento.' });
  }
});

router.post('/webhook', async (req, res) => {
  res.status(200).end();

  const client = mpClient();
  if (!client) return;

  const paymentId = (req.body && req.body.data && req.body.data.id) || req.query.id || req.query['data.id'];
  const topic = req.query.topic || req.query.type || (req.body && req.body.type);
  if (!paymentId || (topic && topic !== 'payment')) return;

  try {
    const payment = new Payment(client);
    const info = await payment.get({ id: paymentId });
    const orderId = info.external_reference;
    if (!orderId) return;
    const order = store.getOrder(orderId);
    if (!order) return;

    const mapaEstado = {
      approved: 'aprobado',
      pending: 'pendiente',
      in_process: 'en_proceso',
      rejected: 'rechazado',
      cancelled: 'cancelado',
      refunded: 'reembolsado',
    };
    const nuevoEstado = mapaEstado[info.status] || info.status;
    const yaSeHabiaAprobado = order.estado === 'aprobado';

    const patch = { estado: nuevoEstado, mpPaymentId: String(info.id) };
    if (nuevoEstado === 'aprobado' && !order.descargaToken) {
      patch.descargaToken = crypto.randomBytes(24).toString('hex');
    }
    const actualizado = store.updateOrder(order.id, patch);

    if (nuevoEstado === 'aprobado' && !order.capiPurchaseEnviado) {
      await enviarPurchaseCAPI({ order: actualizado, siteUrl: SITE_URL });
      store.updateOrder(order.id, { capiPurchaseEnviado: true });
    }

    if (nuevoEstado === 'aprobado' && !order.googleAdsEnviado) {
      await enviarCompraGoogle({ order: actualizado });
      store.updateOrder(order.id, { googleAdsEnviado: true });
    }

    if (nuevoEstado === 'aprobado' && !yaSeHabiaAprobado && !order.correoEnviado && actualizado.email) {
      const itemsConArchivo = actualizado.items.map((item) => {
        if (item.tipo !== 'producto') return item;
        const producto = store.getProduct(item.itemId);
        const archivoExiste = !!(producto && producto.archivo && fs.existsSync(path.join(UPLOAD_DIR, path.basename(producto.archivo))));
        return { ...item, archivoDisponible: archivoExiste };
      });
      const contenido = store.getContent();
      enviarCorreoConfirmacionCompra({
        to: actualizado.email,
        order: { ...actualizado, items: itemsConArchivo },
        siteUrl: SITE_URL,
        numeroWhatsapp: contenido.whatsapp_numero,
      })
        .then(() => store.updateOrder(order.id, { correoEnviado: true }))
        .catch((err) => {
          // Si el correo no se pudo enviar (ej. servicio no configurado), el pedido sigue visible en /admin > Ventas.
          console.error(`[checkout] No se pudo enviar el correo de confirmacion del pedido ${order.id}:`, err.message);
        });
    }
  } catch (err) {
    // Si Mercado Pago reintenta despues, se procesa en el proximo intento.
  }
});

module.exports = router;
