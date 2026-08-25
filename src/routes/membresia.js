const express = require('express');
const { MercadoPagoConfig, PreApproval, PreApprovalPlan } = require('mercadopago');
const store = require('../store');
const { SITE_URL } = require('../config');
const { requireCliente } = require('./auth');

const router = express.Router();

const PRECIO_MEMBRESIA = 50;

function mpClient() {
  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) return null;
  return new MercadoPagoConfig({ accessToken });
}

// Crea el plan de membresia en Mercado Pago la primera vez que alguien se
// suscribe (una sola vez para todo el sitio), y reutiliza su id despues.
async function obtenerOCrearPlan(client) {
  const planId = store.getMembresiaPlanId();
  if (planId) return planId;
  const plan = new PreApprovalPlan(client);
  const creado = await plan.create({
    body: {
      reason: 'Membresía Endulcora',
      back_url: `${SITE_URL}/membresia`,
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: PRECIO_MEMBRESIA,
        currency_id: 'MXN',
      },
    },
  });
  store.setMembresiaPlanId(creado.id);
  return creado.id;
}

router.post('/suscribirse', requireCliente, async (req, res) => {
  const client = mpClient();
  if (!client) return res.status(503).json({ error: 'Los pagos todavía no están configurados.' });

  const usuario = store.getUserById(req.session.userId);
  if (!usuario) return res.status(401).json({ error: 'Tienes que iniciar sesión.' });
  if (usuario.membresiaEstado === 'activa') {
    return res.status(400).json({ error: 'Ya tienes la membresía activa.' });
  }

  try {
    const planId = await obtenerOCrearPlan(client);
    const preapproval = new PreApproval(client);
    const creado = await preapproval.create({
      body: {
        preapproval_plan_id: planId,
        payer_email: usuario.email,
        external_reference: String(usuario.id),
        back_url: `${SITE_URL}/membresia`,
        reason: 'Membresía Endulcora',
      },
    });
    store.updateUser(usuario.id, { membresiaPreapprovalId: creado.id });
    res.status(201).json({ url: creado.init_point });
  } catch (err) {
    const detalle = (err && err.cause && JSON.stringify(err.cause)) || (err && err.message) || String(err);
    console.error('[membresia] Error al crear la suscripción:', detalle);
    res.status(502).json({ error: 'No se pudo iniciar la suscripción. Intenta de nuevo en un momento.' });
  }
});

// Mercado Pago avisa aqui cuando la suscripcion de un cliente cambia de
// estado (autorizada, pausada, cancelada...). Con esto se le quita o da
// acceso al contenido de membresia automaticamente, sin intervencion manual.
router.post('/webhook', async (req, res) => {
  res.status(200).end();

  const client = mpClient();
  if (!client) return;

  const topic = req.query.topic || req.query.type || (req.body && req.body.type);
  const preapprovalId = (req.body && req.body.data && req.body.data.id) || req.query.id || req.query['data.id'];
  if (!preapprovalId || (topic && topic !== 'subscription_preapproval' && topic !== 'preapproval')) return;

  try {
    const preapproval = new PreApproval(client);
    const info = await preapproval.get({ id: preapprovalId });
    const usuario = (info.external_reference && store.getUserById(info.external_reference)) || store.getUserByPreapprovalId(String(info.id));
    if (!usuario) return;

    const mapaEstado = {
      authorized: 'activa',
      paused: 'pausada',
      cancelled: 'cancelada',
      pending: 'pendiente',
    };
    const nuevoEstado = mapaEstado[info.status] || info.status;
    store.updateUser(usuario.id, { membresiaEstado: nuevoEstado, membresiaPreapprovalId: String(info.id) });
  } catch (err) {
    // Si Mercado Pago reintenta despues, se procesa en el proximo intento.
  }
});

router.post('/cancelar', requireCliente, async (req, res) => {
  const client = mpClient();
  if (!client) return res.status(503).json({ error: 'Los pagos todavía no están configurados.' });

  const usuario = store.getUserById(req.session.userId);
  if (!usuario) return res.status(401).json({ error: 'Tienes que iniciar sesión.' });
  if (!usuario.membresiaPreapprovalId) {
    return res.status(400).json({ error: 'No tienes una membresía activa que cancelar.' });
  }
  try {
    const preapproval = new PreApproval(client);
    await preapproval.update({ id: usuario.membresiaPreapprovalId, body: { status: 'cancelled' } });
    store.updateUser(usuario.id, { membresiaEstado: 'cancelada' });
    res.json({ ok: true });
  } catch (err) {
    res.status(502).json({ error: 'No se pudo cancelar la membresía. Intenta de nuevo en un momento.' });
  }
});

router.get('/estado', requireCliente, (req, res) => {
  const usuario = store.getUserById(req.session.userId);
  if (!usuario) return res.status(401).json({ error: 'Tienes que iniciar sesión.' });
  res.json({ activa: usuario.membresiaEstado === 'activa', estado: usuario.membresiaEstado });
});

router.get('/contenido', requireCliente, (req, res) => {
  const usuario = store.getUserById(req.session.userId);
  if (!usuario || usuario.membresiaEstado !== 'activa') {
    return res.status(403).json({ error: 'Necesitas una membresía activa para ver este contenido.' });
  }
  res.json(store.getContenidoMembresia());
});

module.exports = router;
