const express = require('express');
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
const store = require('../store');
const meta = require('../meta');
const { SITE_URL } = require('../config');

const router = express.Router();

const MAX_ARTICULOS = 5;
const MAX_CANTIDAD_POR_ARTICULO = 10;
const MONEDA = process.env.MONEDA || 'MXN';

function mpClient() {
  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) return null;
  return new MercadoPagoConfig({ accessToken });
}

function parsePrecio(valor) {
  const numero = parseFloat(String(valor).replace(/,/g, ''));
  return Number.isFinite(numero) ? numero : 0;
}

function texto(valor, max = 160) {
  return String(valor ?? '').trim().slice(0, max);
}

// ---- Iniciar el pago ----

router.post('/preference', async (req, res) => {
  const client = mpClient();
  if (!client) return res.status(503).json({ error: 'Los pagos todavia no estan configurados.' });

  const { items: pedido, email, telefono, nombre, atribucion, eventId } = req.body || {};
  if (!Array.isArray(pedido) || pedido.length === 0) {
    return res.status(400).json({ error: 'No elegiste ninguna opcion.' });
  }
  if (pedido.length > MAX_ARTICULOS) {
    return res.status(400).json({ error: 'Demasiadas opciones en un solo pedido.' });
  }

  // El precio SIEMPRE se toma de la base de datos, nunca del navegador: si se
  // confiara en lo que manda el cliente, cualquiera podria comprar en $1.
  const resueltos = [];
  for (const linea of pedido) {
    const cantidad = Math.max(1, Math.min(MAX_CANTIDAD_POR_ARTICULO, parseInt(linea.cantidad, 10) || 1));
    const oferta = store.getOferta(linea.id);
    if (!oferta || oferta.activo === false) {
      return res.status(404).json({ error: 'Esa opcion ya no esta disponible.' });
    }
    const precio = parsePrecio(oferta.precio);
    if (precio <= 0) continue;
    resueltos.push({ itemId: oferta.id, titulo: oferta.titulo, precio, cantidad });
  }

  if (!resueltos.length) {
    return res.status(400).json({ error: 'No hay opciones validas para cobrar.' });
  }

  const total = resueltos.reduce((acc, r) => acc + r.precio * r.cantidad, 0);
  const atrib = atribucion || {};

  // La atribucion se guarda con el pedido porque el webhook de Mercado Pago
  // llega horas despues, desde los servidores de Mercado Pago: en ese momento
  // ya no hay cookies ni URL del visitante de donde sacar el fbc/fbp.
  const order = store.addOrder({
    items: resueltos,
    total,
    email: texto(email),
    telefono: texto(telefono, 30),
    nombre: texto(nombre, 120),
    atribucion: {
      fbp: texto(atrib.fbp, 255),
      fbc: texto(atrib.fbc, 255),
      fbclid: texto(atrib.fbclid, 255),
      utm_campaign: texto(atrib.utm_campaign),
      utm_source: texto(atrib.utm_source),
      utm_content: texto(atrib.utm_content),
      landing: texto(atrib.landing, 300),
      userAgent: texto(req.headers['user-agent'], 400),
      ip: (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '',
      // El event_id de InitiateCheckout no sirve para Purchase: son eventos
      // distintos y cada uno necesita el suyo.
      purchaseEventId: meta.nuevoEventId('purchase'),
    },
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
          currency_id: MONEDA,
        })),
        payer: email ? { email } : undefined,
        external_reference: String(order.id),
        back_urls: {
          success: `${SITE_URL}/gracias?pago=exito&pedido=${order.id}`,
          failure: `${SITE_URL}/?pago=error`,
          pending: `${SITE_URL}/gracias?pago=pendiente&pedido=${order.id}`,
        },
        auto_return: 'approved',
        notification_url: `${SITE_URL}/api/checkout/webhook`,
      },
    });

    store.updateOrder(order.id, { mpPreferenceId: resultado.id });

    // InitiateCheckout: le dice a Meta quien llego hasta la pasarela de pago.
    // Es la senal intermedia que permite optimizar antes de tener compras.
    const initEventId = texto(eventId, 100) || meta.nuevoEventId('initcheckout');
    meta
      .enviarEvento({
        eventName: 'InitiateCheckout',
        eventId: initEventId,
        eventSourceUrl: atrib.landing || `${SITE_URL}/`,
        persona: { nombre, email, telefono, externalId: `order-${order.id}` },
        navegador: meta.datosDelNavegador(req, { fbp: atrib.fbp, fbc: atrib.fbc, fbclid: atrib.fbclid }),
        customData: {
          value: total,
          currency: MONEDA,
          content_ids: resueltos.map((r) => String(r.itemId)),
          num_items: resueltos.reduce((acc, r) => acc + r.cantidad, 0),
        },
      })
      .then((r) => store.registrarEventoMeta({ eventName: 'InitiateCheckout', eventId: initEventId, ok: r.ok, motivo: r.motivo, valor: total }));

    const usarSandbox = process.env.MP_SANDBOX === 'true';
    const url = usarSandbox ? (resultado.sandbox_init_point || resultado.init_point) : resultado.init_point;
    res.status(201).json({ url, pedidoId: order.id });
  } catch (err) {
    store.updateOrder(order.id, { estado: 'error' });
    res.status(502).json({ error: 'No se pudo iniciar el pago. Intenta de nuevo en un momento.' });
  }
});

// ---- Webhook de Mercado Pago ----
// Aqui nace el Purchase. Se manda SOLO desde el servidor (action_source
// 'website' con los datos guardados del pedido) porque el navegador no es
// confiable para el evento que mas pesa: el visitante puede cerrar la pestana
// al volver de Mercado Pago y la venta se perderia en el reporte de la campana.

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
    const actualizado = store.updateOrder(order.id, { estado: nuevoEstado, mpPaymentId: String(info.id) });

    // Mercado Pago reintenta el webhook varias veces por el mismo pago. Sin
    // esta bandera, la misma venta se reportaria a Meta tres o cuatro veces y
    // el ROAS de la campana saldria inflado.
    if (nuevoEstado !== 'aprobado' || actualizado.metaPurchaseEnviado) return;

    const atrib = actualizado.atribucion || {};
    const eventId = atrib.purchaseEventId || meta.nuevoEventId('purchase');

    const resultado = await meta.enviarEvento({
      eventName: 'Purchase',
      eventId,
      eventSourceUrl: atrib.landing || `${SITE_URL}/`,
      persona: {
        nombre: actualizado.nombre,
        email: actualizado.email || info.payer?.email || '',
        telefono: actualizado.telefono,
        externalId: `order-${actualizado.id}`,
      },
      navegador: { ip: atrib.ip || null, userAgent: atrib.userAgent || null, fbp: atrib.fbp || null, fbc: atrib.fbc || null },
      customData: {
        value: actualizado.total,
        currency: MONEDA,
        content_ids: (actualizado.items || []).map((i) => String(i.itemId)),
        contents: (actualizado.items || []).map((i) => ({ id: String(i.itemId), quantity: i.cantidad, item_price: i.precio })),
        num_items: (actualizado.items || []).reduce((acc, i) => acc + i.cantidad, 0),
        order_id: String(actualizado.id),
      },
    });

    store.updateOrder(order.id, { metaPurchaseEnviado: resultado.ok, metaPurchaseEventId: eventId });
    store.registrarEventoMeta({ eventName: 'Purchase', eventId, ok: resultado.ok, motivo: resultado.motivo, valor: actualizado.total });
  } catch (err) {
    // Si algo falla aqui, Mercado Pago reintenta el webhook y se procesa en el
    // proximo intento; la bandera metaPurchaseEnviado evita el doble conteo.
    console.error('[checkout] Error procesando el webhook:', err.message);
  }
});

module.exports = router;
