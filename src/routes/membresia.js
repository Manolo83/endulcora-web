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

// Cada cobro recurrente (el primero y cada mes despues) llega como un
// "authorized_payment" independiente del estado de la suscripcion. Se
// registra aqui para que aparezca en /admin > Ventas, sin importar si el
// cobro salio bien o mal (para llevar el registro contable completo).
const MAPA_ESTADO_PAGO = {
  processed: 'aprobado',
  scheduled: 'programado',
  recycled: 'reintentando',
  cancelled: 'cancelado',
  rejected: 'rechazado',
};

// Devuelve true si guardo un pago nuevo (false si ya estaba registrado).
function guardarPagoDesdeInfo(info, usuario) {
  if (store.getMembresiaPagoPorAuthorizedId(info.id)) return false;
  store.addMembresiaPago({
    userId: usuario ? usuario.id : null,
    email: usuario ? usuario.email : '',
    nombre: usuario ? usuario.nombre : '',
    monto: info.transaction_amount || PRECIO_MEMBRESIA,
    estado: MAPA_ESTADO_PAGO[info.status] || info.status || 'desconocido',
    mpAuthorizedPaymentId: info.id,
    mpPaymentId: info.payment && info.payment.id ? info.payment.id : '',
    fecha: info.date_created,
  });
  return true;
}

async function registrarPagoMembresia(authorizedPaymentId) {
  const accessToken = process.env.MP_ACCESS_TOKEN;
  const res = await fetch(`https://api.mercadopago.com/authorized_payments/${authorizedPaymentId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return;
  const info = await res.json();
  const usuario = info.preapproval_id ? store.getUserByPreapprovalId(info.preapproval_id) : null;
  guardarPagoDesdeInfo(info, usuario);
}

// Trae y guarda los cobros pasados de una suscripcion que no se hayan
// registrado todavia (por ejemplo, los de antes de que existiera este
// registro, o si algun aviso de Mercado Pago no llego). Se usa desde
// /admin para reparar el historial contable sin depender solo del webhook.
async function sincronizarPagosDePreapproval(preapprovalId, usuario) {
  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken || !preapprovalId) return 0;
  const res = await fetch(`https://api.mercadopago.com/authorized_payments/search?preapproval_id=${encodeURIComponent(preapprovalId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return 0;
  const data = await res.json();
  const resultados = data.results || [];
  let agregados = 0;
  for (const info of resultados) {
    if (guardarPagoDesdeInfo(info, usuario)) agregados += 1;
  }
  return agregados;
}

// Mercado Pago avisa aqui cuando la suscripcion de un cliente cambia de
// estado (autorizada, pausada, cancelada...). Con esto se le quita o da
// acceso al contenido de membresia automaticamente, sin intervencion manual.
router.post('/webhook', async (req, res) => {
  res.status(200).end();

  const topic = req.query.topic || req.query.type || (req.body && req.body.type);
  const dataId = (req.body && req.body.data && req.body.data.id) || req.query.id || req.query['data.id'];
  if (!dataId) return;

  try {
    if (topic === 'subscription_authorized_payment') {
      await registrarPagoMembresia(dataId);
      return;
    }

    const client = mpClient();
    if (!client) return;
    if (topic && topic !== 'subscription_preapproval' && topic !== 'preapproval') return;

    const preapproval = new PreApproval(client);
    const info = await preapproval.get({ id: dataId });
    const usuario = (info.external_reference && store.getUserById(info.external_reference)) || store.getUserByPreapprovalId(String(info.id));
    if (!usuario) return;

    const mapaEstado = {
      authorized: 'activa',
      paused: 'pausada',
      cancelled: 'cancelada',
      pending: 'pendiente',
    };
    const nuevoEstado = mapaEstado[info.status] || info.status;
    const patch = { membresiaEstado: nuevoEstado, membresiaPreapprovalId: String(info.id) };
    // Solo se reinicia el "reloj" de la biblioteca de clases cuando de
    // verdad se activa desde un estado que no era activo (alta nueva o
    // reactivacion) — no en cada cobro mensual de quien ya seguia activo.
    if (nuevoEstado === 'activa' && usuario.membresiaEstado !== 'activa') {
      patch.membresiaActivaDesde = new Date().toISOString().slice(0, 10);
    }
    store.updateUser(usuario.id, patch);
  } catch (err) {
    // Si Mercado Pago reintenta despues, se procesa en el proximo intento.
  }
});

router.post('/cancelar', requireCliente, async (req, res) => {
  const usuario = store.getUserById(req.session.userId);
  if (!usuario) return res.status(401).json({ error: 'Tienes que iniciar sesión.' });
  if (usuario.membresiaEstado !== 'activa') {
    return res.status(400).json({ error: 'No tienes una membresía activa que cancelar.' });
  }
  // Membresias activadas a mano desde /admin (sin suscripcion real en
  // Mercado Pago) no tienen preapproval que cancelar ahi: solo se le quita
  // el acceso localmente.
  if (!usuario.membresiaPreapprovalId) {
    store.updateUser(usuario.id, { membresiaEstado: 'cancelada' });
    return res.json({ ok: true });
  }

  const client = mpClient();
  if (!client) return res.status(503).json({ error: 'Los pagos todavía no están configurados.' });
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
  const { recetarioUrl, revistaUrl, ...resto } = store.getContenidoMembresia();
  res.json({ ...resto, recetarioDisponible: !!recetarioUrl, revistaDisponible: !!revistaUrl });
});

// Biblioteca de clases en vivo grabadas: exclusiva para miembros con
// membresia activa (o el admin, para revisarla sin pagar).
router.get('/biblioteca-clases', (req, res) => {
  if (esAdmin(req)) return res.json(store.getBibliotecaClases());
  const usuario = req.session && req.session.userId ? store.getUserById(req.session.userId) : null;
  if (!usuario || usuario.membresiaEstado !== 'activa') {
    return res.status(403).json({ error: 'Necesitas una membresía activa para ver la biblioteca de clases.' });
  }
  // "Borron y cuenta nueva": si tiene fecha de corte guardada (se puso la
  // ultima vez que se activo su membresia), solo ve clases grabadas desde
  // ese dia en adelante — no las de antes de que se hiciera miembro.
  const desde = usuario.membresiaActivaDesde || '';
  const lista = desde ? store.getBibliotecaClases().filter((c) => (c.fecha || '') >= desde) : store.getBibliotecaClases();
  res.json(lista);
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

// Lectura de la revista mensual: igual que el recetario, revisa la
// membresia en cada solicitud. Se sirve "inline" (no como descarga forzada)
// para que se abra directo en el visor de PDF del navegador, listo para leer.
router.get('/revista', (req, res) => {
  if (!esAdmin(req)) {
    const usuario = req.session && req.session.userId ? store.getUserById(req.session.userId) : null;
    if (!usuario || usuario.membresiaEstado !== 'activa') {
      return res.status(403).send('Necesitas una membresía activa para leer la revista.');
    }
  }
  const contenido = store.getContenidoMembresia();
  if (!contenido.revistaUrl) return res.status(404).send('Todavía no hay revista publicada este mes.');
  const filename = path.basename(contenido.revistaUrl);
  const rutaCompleta = path.join(UPLOAD_DIR, filename);
  if (!fs.existsSync(rutaCompleta)) return res.status(404).send('No pudimos encontrar la revista en este momento.');
  res.setHeader('Content-Disposition', `inline; filename="${(contenido.revistaNombre || `Revista${path.extname(filename)}`).replace(/"/g, '')}"`);
  res.sendFile(rutaCompleta);
});

module.exports = router;
module.exports.sincronizarPagosDePreapproval = sincronizarPagosDePreapproval;
