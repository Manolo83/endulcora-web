const express = require('express');
const path = require('path');
const fs = require('fs');
const { MercadoPagoConfig, PreApproval } = require('mercadopago');
const store = require('../store');
const { SITE_URL, UPLOAD_DIR } = require('../config');
const { requireCliente } = require('./auth');

const router = express.Router();

const PRECIO_MEMBRESIA = 50;

function mpClient() {
  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) return null;
  return new MercadoPagoConfig({ accessToken });
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
    const preapproval = new PreApproval(client);
    const creado = await preapproval.create({
      body: {
        reason: 'Membresía Endulcora',
        auto_recurring: {
          frequency: 1,
          frequency_type: 'months',
          transaction_amount: PRECIO_MEMBRESIA,
          currency_id: 'MXN',
        },
        payer_email: usuario.email,
        external_reference: String(usuario.id),
        back_url: `${SITE_URL}/membresia`,
        status: 'pending',
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

// El admin (sesion aparte, /admin) siempre puede ver el contenido de
// membresia para revisarlo sin necesitar una cuenta de cliente ni pagar.
function esAdmin(req) {
  return !!(req.session && req.session.isAdmin);
}

router.get('/estado', (req, res) => {
  if (esAdmin(req)) return res.json({ activa: true, estado: 'activa', esAdmin: true });
  if (!req.session || !req.session.userId) return res.status(401).json({ error: 'Tienes que iniciar sesión.' });
  const usuario = store.getUserById(req.session.userId);
  if (!usuario) return res.status(401).json({ error: 'Tienes que iniciar sesión.' });
  res.json({ activa: usuario.membresiaEstado === 'activa', estado: usuario.membresiaEstado });
});

router.get('/contenido', (req, res) => {
  if (!esAdmin(req)) {
    const usuario = req.session && req.session.userId ? store.getUserById(req.session.userId) : null;
    if (!usuario || usuario.membresiaEstado !== 'activa') {
      return res.status(403).json({ error: 'Necesitas una membresía activa para ver este contenido.' });
    }
  }
  const { recetarioUrl, ...resto } = store.getContenidoMembresia();
  res.json({ ...resto, recetarioDisponible: !!recetarioUrl });
});

// Descarga del recetario del mes: revisa la membresia en cada solicitud
// (en vez de exponer el link fijo de /uploads) para que el archivo no se
// pueda seguir descargando si se comparte el link o si la membresia vence.
router.get('/recetario', (req, res) => {
  if (!esAdmin(req)) {
    const usuario = req.session && req.session.userId ? store.getUserById(req.session.userId) : null;
    if (!usuario || usuario.membresiaEstado !== 'activa') {
      return res.status(403).send('Necesitas una membresía activa para descargar el recetario.');
    }
  }
  const contenido = store.getContenidoMembresia();
  if (!contenido.recetarioUrl) return res.status(404).send('Todavía no hay recetario publicado este mes.');
  const filename = path.basename(contenido.recetarioUrl);
  const rutaCompleta = path.join(UPLOAD_DIR, filename);
  if (!fs.existsSync(rutaCompleta)) return res.status(404).send('No pudimos encontrar el recetario en este momento.');
  const nombreDescarga = contenido.recetarioNombre || `Recetario${path.extname(filename)}`;
  res.download(rutaCompleta, nombreDescarga);
});

module.exports = router;
