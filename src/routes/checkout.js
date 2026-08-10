const express = require('express');
const crypto = require('crypto');
const { Payment } = require('mercadopago');
const store = require('../store');
const { SITE_URL } = require('../config');
const { enviarCorreoConfirmacionCompra } = require('../email');
const { mpClient, parsePrecio, crearPreferencia } = require('../pagos');

const router = express.Router();

const MAX_ARTICULOS = 15;
const MAX_CANTIDAD_POR_ARTICULO = 20;

router.post('/preference', async (req, res) => {
  const client = mpClient();
  if (!client) return res.status(503).json({ error: 'Los pagos todavia no estan configurados.' });

  const { items: pedido, email } = req.body || {};
  if (!Array.isArray(pedido) || pedido.length === 0) {
    return res.status(400).json({ error: 'Tu carrito esta vacio.' });
  }
  if (pedido.length > MAX_ARTICULOS) {
    return res.status(400).json({ error: 'Demasiados artículos distintos en un solo pedido.' });
  }

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
    const precio = parsePrecio(item.precio);
    if (precio <= 0) continue;
    resueltos.push({ tipo: linea.tipo, itemId: item.id, titulo: item.titulo, precio, cantidad });
  }

  if (!resueltos.length) {
    return res.status(400).json({ error: 'No hay artículos validos en tu carrito.' });
  }

  const total = resueltos.reduce((acc, r) => acc + r.precio * r.cantidad, 0);
  const userId = req.session && req.session.userId ? req.session.userId : null;
  const usuario = userId ? store.getUserById(userId) : null;
  const order = store.addOrder({ items: resueltos, total, email: email || (usuario ? usuario.email : ''), userId });

  try {
    const { url, preferenceId } = await crearPreferencia({ resueltos, email, orderId: order.id });
    store.updateOrder(order.id, { mpPreferenceId: preferenceId });
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

    if (nuevoEstado === 'aprobado' && !yaSeHabiaAprobado && !order.correoEnviado && actualizado.email) {
      const itemsConArchivo = actualizado.items.map((item) => {
        if (item.tipo !== 'producto') return item;
        const producto = store.getProduct(item.itemId);
        return { ...item, archivoDisponible: !!(producto && producto.archivo) };
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
