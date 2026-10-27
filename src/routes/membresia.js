const express = require('express');
const path = require('path');
const fs = require('fs');
const { MercadoPagoConfig, PreApproval } = require('mercadopago');
const store = require('../store');
const { SITE_URL, UPLOAD_DIR } = require('../config');
const { requireCliente } = require('./auth');
const { contarPaginasPDF, generarPaginaLecturaPDF } = require('../caratula');
const regalo = require('../membresiaRegalo');
const { enviarCorreoRegaloActivado } = require('../email');

const router = express.Router();

const PRECIO_MEMBRESIA = 100;

function mpClient() {
  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) return null;
  return new MercadoPagoConfig({ accessToken });
}

// Crea la suscripcion mensual en Mercado Pago y regresa el link para que la
// clienta registre su tarjeta. Con primerCobro (fecha futura) el primer
// cargo se programa para ese dia en vez de hacerse de inmediato — asi
// funciona el mes de regalo.
async function crearSuscripcion(client, usuario, { reason = 'Membresía Endulcora', primerCobro = null, backUrl = `${SITE_URL}/membresia` } = {}) {
  const autoRecurring = {
    frequency: 1,
    frequency_type: 'months',
    transaction_amount: PRECIO_MEMBRESIA,
    currency_id: 'MXN',
  };
  if (primerCobro) autoRecurring.start_date = new Date(primerCobro).toISOString();
  const preapproval = new PreApproval(client);
  return preapproval.create({
    body: {
      reason,
      auto_recurring: autoRecurring,
      payer_email: usuario.email,
      external_reference: String(usuario.id),
      back_url: backUrl,
      notification_url: `${SITE_URL}/api/membresia/webhook`,
      status: 'pending',
    },
  });
}

router.post('/suscribirse', requireCliente, async (req, res) => {
  const client = mpClient();
  if (!client) return res.status(503).json({ error: 'Los pagos todavía no están configurados.' });

  const usuario = store.getUserById(req.session.userId);
  if (!usuario) return res.status(401).json({ error: 'Tienes que iniciar sesión.' });
  // Quien cancelo durante su mes de regalo sigue "activa" hasta que se le
  // acabe; puede volver a domiciliar su membresia antes, y el primer cobro
  // se programa para el dia en que termina el regalo (no se le cobra doble).
  const reactivaRegalo = usuario.membresiaEstado === 'activa' && regalo.regaloActivo(usuario) && usuario.membresiaRegaloCancelada;
  if (usuario.membresiaEstado === 'activa' && !reactivaRegalo) {
    return res.status(400).json({ error: 'Ya tienes la membresía activa.' });
  }

  try {
    const creado = await crearSuscripcion(client, usuario, { primerCobro: reactivaRegalo ? usuario.membresiaRegaloHasta : null });
    store.updateUser(usuario.id, { membresiaPreapprovalId: creado.id });
    res.status(201).json({ url: creado.init_point });
  } catch (err) {
    const detalle = (err && err.cause && JSON.stringify(err.cause)) || (err && err.message) || String(err);
    console.error('[membresia] Error al crear la suscripción:', detalle);
    res.status(502).json({ error: 'No se pudo iniciar la suscripción. Intenta de nuevo en un momento.' });
  }
});

// Boton "Descarga aqui el recetario" del live: 1 mes de membresia de regalo
// para quien nunca ha sido miembro. Registra su tarjeta en Mercado Pago
// (paga $0 hoy) y el primer cobro de $100 se programa a los 30 dias. Se
// guarda una copia del recetario del live de hoy en su cuenta, para que lo
// pueda descargar aunque la semana siguiente se suba otro.
router.post('/suscribirse-regalo', requireCliente, async (req, res) => {
  const contenido = store.getContent();
  if (contenido.clase_regalo_membresia_activo === 'false') {
    return res.status(400).json({ error: 'El mes de regalo no está disponible en este momento.' });
  }
  const client = mpClient();
  if (!client) return res.status(503).json({ error: 'Los pagos todavía no están configurados.' });

  const usuario = store.getUserById(req.session.userId);
  if (!usuario) return res.status(401).json({ error: 'Tienes que iniciar sesión.' });
  if (usuario.membresiaEstado === 'activa') {
    return res.status(400).json({ error: 'Ya tienes la membresía activa.' });
  }
  if (!regalo.esElegibleRegalo(usuario)) {
    return res.status(400).json({ error: 'El mes de regalo es solo para quien nunca ha sido miembro. Puedes hacerte miembro por $100 al mes.' });
  }

  try {
    const creado = await crearSuscripcion(client, usuario, {
      reason: 'Membresía Endulcora · 1 mes de regalo',
      primerCobro: regalo.fechaFinRegalo(),
      backUrl: `${SITE_URL}/membresia?regalo=1`,
    });
    store.updateUser(usuario.id, {
      membresiaPreapprovalId: creado.id,
      regaloPreapprovalId: creado.id,
      membresiaOrigen: 'regalo_live',
      regaloRecetarioUrl: contenido.clase_recetario_url || '',
      regaloRecetarioNombre: contenido.clase_recetario_nombre || '',
    });
    res.status(201).json({ url: creado.init_point });
  } catch (err) {
    const detalle = (err && err.cause && JSON.stringify(err.cause)) || (err && err.message) || String(err);
    console.error('[membresia] Error al crear la suscripción de regalo:', detalle);
    res.status(502).json({ error: 'No se pudo activar tu mes de regalo. Intenta de nuevo en un momento.' });
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

const MAPA_ESTADO_PREAPPROVAL = {
  authorized: 'activa',
  paused: 'pausada',
  cancelled: 'cancelada',
  pending: 'pendiente',
};

// Aplica al usuario local el estado real de una suscripcion segun Mercado
// Pago (info de un PreApproval). Se usa desde el webhook y desde la
// reconciliacion manual de /admin, para no duplicar el mapeo de estados.
// Devuelve true si cambio algo.
function aplicarEstadoDesdePreapprovalInfo(info) {
  const usuario = (info.external_reference && store.getUserById(info.external_reference)) || store.getUserByPreapprovalId(String(info.id));
  if (!usuario) return false;

  const idInfo = String(info.id);
  const nuevoEstado = MAPA_ESTADO_PREAPPROVAL[info.status] || info.status;
  // Aviso de una suscripcion que ya no es la suya actual (p.ej. la del
  // regalo que cancelo, despues de volver a domiciliar con otra): no debe
  // quitarle el acceso que le da la nueva.
  if (usuario.membresiaPreapprovalId && usuario.membresiaPreapprovalId !== idInfo && nuevoEstado !== 'activa') return false;

  // Durante el mes de regalo, cancelar (o que Mercado Pago pause la
  // suscripcion) solo detiene el cobro futuro: conserva el acceso hasta el
  // ultimo dia del regalo, y el programador de automatizaciones se lo quita
  // ese dia (ver revisarRegalosMembresia).
  if (nuevoEstado !== 'activa' && usuario.membresiaEstado === 'activa' && regalo.regaloActivo(usuario)) {
    if (usuario.membresiaRegaloCancelada) return false;
    store.updateUser(usuario.id, { membresiaRegaloCancelada: true });
    return true;
  }

  const reactivoRegalo = nuevoEstado === 'activa' && usuario.membresiaRegaloCancelada;
  if (usuario.membresiaEstado === nuevoEstado && usuario.membresiaPreapprovalId === idInfo && !reactivoRegalo) return false;

  const patch = { membresiaEstado: nuevoEstado, membresiaPreapprovalId: idInfo };
  // Volvio a domiciliar antes de que se acabara su regalo cancelado.
  if (reactivoRegalo) patch.membresiaRegaloCancelada = false;
  // Activacion de la suscripcion del mes de regalo: arranca el contador.
  // Termina el dia del primer cobro programado en Mercado Pago.
  const activaRegalo = nuevoEstado === 'activa' && usuario.regaloPreapprovalId === idInfo && !usuario.membresiaRegaloHasta;
  // Anti "regalo doble": esa cuenta de Mercado Pago ya activo un regalo con
  // otra cuenta de endulcora.com. No se le da acceso y se cancela la
  // suscripcion en Mercado Pago (nunca se le cobra nada por ella).
  if (activaRegalo && regalo.payerYaUsoRegalo(info.payer_id, usuario.id)) {
    store.updateUser(usuario.id, { membresiaEstado: 'cancelada', regaloRechazado: true });
    cancelarPreapprovalEnMercadoPago(idInfo);
    console.warn(`[membresia] Regalo rechazado a ${usuario.email}: la cuenta de Mercado Pago ${info.payer_id} ya lo había usado.`);
    return true;
  }
  if (activaRegalo) {
    if (info.payer_id) patch.regaloPayerId = String(info.payer_id);
    const inicioCobro = info.auto_recurring && info.auto_recurring.start_date ? new Date(info.auto_recurring.start_date) : null;
    const hasta = inicioCobro && !isNaN(inicioCobro) && inicioCobro > new Date() ? inicioCobro : regalo.fechaFinRegalo();
    patch.membresiaRegaloHasta = hasta.toISOString();
    patch.membresiaRegaloCancelada = false;
    patch.regaloRecordatoriosEnviados = [];
  }
  // Solo se reinicia el "reloj" de la biblioteca de clases cuando de
  // verdad se activa desde un estado que no era activo (alta nueva o
  // reactivacion) — no en cada cobro mensual de quien ya seguia activo.
  if (nuevoEstado === 'activa' && usuario.membresiaEstado !== 'activa') {
    patch.membresiaActivaDesde = new Date().toISOString().slice(0, 10);
    // A diferencia de membresiaActivaDesde (que se actualiza en cada
    // reactivacion), esta fecha se guarda una sola vez, la primera vez que
    // la cuenta se activa en toda su historia — es lo que define su
    // "numero de suscriptor" permanente, aunque despues cancele y vuelva.
    if (!usuario.membresiaPrimeraActivacion) {
      patch.membresiaPrimeraActivacion = new Date().toISOString();
    }
  }
  const actualizado = store.updateUser(usuario.id, patch);
  if (activaRegalo) {
    enviarCorreoRegaloActivado({ to: actualizado.email, nombre: actualizado.nombre, siteUrl: SITE_URL, hasta: actualizado.membresiaRegaloHasta })
      .catch((e) => console.error('[membresia] No se pudo mandar el correo de bienvenida del regalo a', actualizado.email, e.message));
  }
  return true;
}

function cancelarPreapprovalEnMercadoPago(preapprovalId) {
  const client = mpClient();
  if (!client) return;
  new PreApproval(client)
    .update({ id: preapprovalId, body: { status: 'cancelled' } })
    .catch((e) => console.error('[membresia] No se pudo cancelar la suscripción', preapprovalId, e.message));
}

// Trae de Mercado Pago el estado real de una suscripcion y lo aplica al
// usuario local. Se usa desde /admin para reparar el acceso de clientes
// cuyo aviso de webhook nunca llego (por ejemplo, suscripciones creadas
// antes de que se configurara notification_url). Devuelve true si corrigio
// algo.
async function sincronizarEstadoDePreapproval(preapprovalId) {
  const client = mpClient();
  if (!client || !preapprovalId) return false;
  try {
    const preapproval = new PreApproval(client);
    const info = await preapproval.get({ id: preapprovalId });
    return aplicarEstadoDesdePreapprovalInfo(info);
  } catch (err) {
    return false;
  }
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
    aplicarEstadoDesdePreapprovalInfo(info);
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
  const enRegalo = regalo.regaloActivo(usuario);
  if (enRegalo && usuario.membresiaRegaloCancelada) {
    return res.status(400).json({ error: 'Tu membresía ya está cancelada; conservas el acceso hasta que termine tu mes de regalo.' });
  }

  const client = mpClient();
  if (!client) return res.status(503).json({ error: 'Los pagos todavía no están configurados.' });
  try {
    const preapproval = new PreApproval(client);
    await preapproval.update({ id: usuario.membresiaPreapprovalId, body: { status: 'cancelled' } });
    // En su mes de regalo no se le cobra nada, pero conserva el acceso
    // hasta el ultimo dia que se le regalo.
    if (enRegalo) {
      store.updateUser(usuario.id, { membresiaRegaloCancelada: true });
      return res.json({ ok: true, conservaAccesoHasta: usuario.membresiaRegaloHasta });
    }
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

function miembroActivoDeRequest(req) {
  const usuario = req.session && req.session.userId ? store.getUserById(req.session.userId) : null;
  return usuario && usuario.membresiaEstado === 'activa' ? usuario : null;
}

router.get('/estado', async (req, res) => {
  const contenido = store.getContent();
  const regaloEnLive = contenido.clase_regalo_membresia_activo !== 'false';
  if (esAdmin(req)) return res.json({ activa: true, estado: 'activa', esAdmin: true, regalo: null, elegibleRegalo: false, regaloEnLive });
  if (!req.session || !req.session.userId) return res.status(401).json({ error: 'Tienes que iniciar sesión.' });
  let usuario = store.getUserById(req.session.userId);
  if (!usuario) return res.status(401).json({ error: 'Tienes que iniciar sesión.' });
  // Al volver de Mercado Pago (?sincronizar=1) el aviso del webhook puede
  // tardar unos segundos: se pregunta directo para no mostrarle "sin
  // membresia" justo despues de haber registrado su tarjeta.
  if (req.query.sincronizar && usuario.membresiaEstado !== 'activa' && usuario.membresiaPreapprovalId) {
    await sincronizarEstadoDePreapproval(usuario.membresiaPreapprovalId);
    usuario = store.getUserById(usuario.id);
  }
  res.json({
    activa: usuario.membresiaEstado === 'activa',
    estado: usuario.membresiaEstado,
    regalo: regalo.resumenRegalo(usuario),
    elegibleRegalo: regalo.esElegibleRegalo(usuario),
    regaloRechazado: !!usuario.regaloRechazado,
    regaloEnLive,
  });
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

// No se expone el link directo del recetario (igual que el resto de
// archivos de membresia): solo si esta disponible, para que la descarga
// real siempre pase por la ruta de abajo (que vuelve a revisar membresia).
function sinRecetarioUrl(clase) {
  const { recetarioUrl, ...resto } = clase;
  return { ...resto, recetarioDisponible: !!recetarioUrl };
}

// Biblioteca de clases en vivo grabadas: exclusiva para miembros con
// membresia activa (o el admin, para revisarla sin pagar).
router.get('/biblioteca-clases', (req, res) => {
  if (esAdmin(req)) return res.json(store.getBibliotecaClases().map(sinRecetarioUrl));
  const usuario = req.session && req.session.userId ? store.getUserById(req.session.userId) : null;
  if (!usuario || usuario.membresiaEstado !== 'activa') {
    return res.status(403).json({ error: 'Necesitas una membresía activa para ver la biblioteca de clases.' });
  }
  // "Borron y cuenta nueva": si tiene fecha de corte guardada (se puso la
  // ultima vez que se activo su membresia), solo ve clases grabadas desde
  // ese dia en adelante — no las de antes de que se hiciera miembro.
  const desde = usuario.membresiaActivaDesde || '';
  const lista = desde ? store.getBibliotecaClases().filter((c) => (c.fecha || '') >= desde) : store.getBibliotecaClases();
  res.json(lista.map(sinRecetarioUrl));
});

// Recetario que acompaña a una clase grabada especifica. Igual que el
// recetario/revista mensual: revisa la membresia en cada solicitud. Por
// defecto se sirve "inline" para leerse dentro de la misma pagina;
// ?descargar=1 lo manda como descarga real (boton "Descargar recetario").
router.get('/biblioteca-clases/:id/recetario', (req, res) => {
  if (!esAdmin(req)) {
    const usuario = req.session && req.session.userId ? store.getUserById(req.session.userId) : null;
    if (!usuario || usuario.membresiaEstado !== 'activa') {
      return res.status(403).send('Necesitas una membresía activa para ver el recetario.');
    }
  }
  const clase = store.getBibliotecaClases().find((c) => c.id === Number(req.params.id));
  if (!clase || !clase.recetarioUrl) return res.status(404).send('Esta clase no tiene recetario.');
  const filename = path.basename(clase.recetarioUrl);
  const rutaCompleta = path.join(UPLOAD_DIR, filename);
  if (!fs.existsSync(rutaCompleta)) return res.status(404).send('No pudimos encontrar el recetario en este momento.');
  const nombreDescarga = (clase.recetarioNombre || `Recetario${path.extname(filename)}`).replace(/"/g, '');
  const disposicion = req.query.descargar ? 'attachment' : 'inline';
  res.setHeader('Content-Disposition', `${disposicion}; filename="${nombreDescarga}"`);
  res.sendFile(rutaCompleta);
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

function enviarArchivoSubido(res, url, nombre, textoNoEncontrado) {
  const filename = path.basename(url);
  const rutaCompleta = path.join(UPLOAD_DIR, filename);
  if (!fs.existsSync(rutaCompleta)) return res.status(404).send(textoNoEncontrado);
  res.download(rutaCompleta, (nombre || `Recetario${path.extname(filename)}`).replace(/"/g, ''));
}

// Recetario de la clase en vivo de esta semana. Ya no se expone el link de
// /uploads en la pagina del live: los miembros activos lo descargan por
// aqui (y quien no es miembro recibe la oferta del mes de regalo).
router.get('/recetario-live', (req, res) => {
  if (!esAdmin(req) && !miembroActivoDeRequest(req)) {
    return res.status(403).send('Necesitas una membresía activa para descargar el recetario.');
  }
  const contenido = store.getContent();
  if (!contenido.clase_recetario_url) return res.status(404).send('Esta clase todavía no tiene recetario.');
  enviarArchivoSubido(res, contenido.clase_recetario_url, contenido.clase_recetario_nombre, 'No pudimos encontrar el recetario en este momento.');
});

// Recetario del live en el que activo su mes de regalo (copia guardada en
// su cuenta en ese momento).
router.get('/recetario-regalo', (req, res) => {
  const usuario = miembroActivoDeRequest(req);
  if (!usuario) return res.status(403).send('Necesitas una membresía activa para descargar el recetario.');
  if (!usuario.regaloRecetarioUrl) return res.status(404).send('No hay recetario guardado en tu cuenta.');
  enviarArchivoSubido(res, usuario.regaloRecetarioUrl, usuario.regaloRecetarioNombre, 'No pudimos encontrar el recetario en este momento.');
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

// ---- Biblioteca de lectura de eBooks (exclusiva para miembros) ----
// A diferencia del recetario/revista (que se sirven "inline" con el PDF
// real, lo que se puede guardar desde el propio visor de PDF del
// navegador), aqui cada pagina se manda como una imagen generada en el
// servidor: nunca se expone el archivo original, asi que no hay boton de
// descarga que valga. Solo aplica a productos categoria "ebook" con un PDF
// propio subido (los paquetes/anexos no tienen archivo propio que leer).
function productosLegiblesMembresia() {
  return store
    .getProducts()
    .filter((p) => p.categoria === 'ebook' && p.archivo && path.extname(p.archivo).toLowerCase() === '.pdf' && !p.ocultoEnCatalogo && !p.esPaquete);
}

function rutaArchivoProducto(producto) {
  return path.join(UPLOAD_DIR, path.basename(producto.archivo));
}

// Cuantas paginas tiene cada eBook: se calcula una vez (es barato, solo lee
// el indice del PDF, no renderiza nada) y se guarda en memoria mientras
// corre el proceso.
const cachePaginasPorProducto = new Map();
async function paginasDeProducto(producto) {
  if (cachePaginasPorProducto.has(producto.id)) return cachePaginasPorProducto.get(producto.id);
  try {
    const total = await contarPaginasPDF(rutaArchivoProducto(producto));
    cachePaginasPorProducto.set(producto.id, total);
    return total;
  } catch (e) {
    return 0;
  }
}

router.get('/ebooks', async (req, res) => {
  if (!esAdmin(req)) {
    const usuario = req.session && req.session.userId ? store.getUserById(req.session.userId) : null;
    if (!usuario || usuario.membresiaEstado !== 'activa') {
      return res.status(403).json({ error: 'Necesitas una membresía activa para ver la biblioteca de eBooks.' });
    }
  }
  const productos = productosLegiblesMembresia().filter((p) => fs.existsSync(rutaArchivoProducto(p)));
  const lista = await Promise.all(
    productos.map(async (p) => ({
      id: p.id,
      titulo: p.titulo,
      subtitulo: p.subtitulo || '',
      imagen: p.imagen || '',
      totalPaginas: await paginasDeProducto(p),
    }))
  );
  res.json(lista.filter((l) => l.totalPaginas > 0));
});

// La carpeta de cache vive dentro de UPLOAD_DIR (el Volume de Railway en
// produccion), para no tener que volver a renderizar cada pagina despues de
// cada redeploy.
const CACHE_LECTURA_DIR = path.join(UPLOAD_DIR, 'lectura-cache');

router.get('/ebooks/:id/pagina/:numero', async (req, res) => {
  if (!esAdmin(req)) {
    const usuario = req.session && req.session.userId ? store.getUserById(req.session.userId) : null;
    if (!usuario || usuario.membresiaEstado !== 'activa') {
      return res.status(403).json({ error: 'Necesitas una membresía activa para leer este eBook.' });
    }
  }
  const producto = productosLegiblesMembresia().find((p) => p.id === Number(req.params.id));
  if (!producto) return res.status(404).json({ error: 'Ese eBook no está disponible para lectura.' });
  const numero = parseInt(req.params.numero, 10);
  if (!Number.isInteger(numero) || numero < 1) return res.status(400).json({ error: 'Número de página inválido.' });

  const rutaPDF = rutaArchivoProducto(producto);
  if (!fs.existsSync(rutaPDF)) return res.status(404).json({ error: 'No pudimos encontrar este eBook en este momento.' });

  const rutaCache = path.join(CACHE_LECTURA_DIR, String(producto.id), `pagina-${numero}.png`);
  try {
    if (!fs.existsSync(rutaCache)) {
      const buffer = await generarPaginaLecturaPDF(rutaPDF, numero);
      if (!buffer) return res.status(404).json({ error: 'Esa página no existe en este eBook.' });
      fs.mkdirSync(path.dirname(rutaCache), { recursive: true });
      fs.writeFileSync(rutaCache, buffer);
    }
    // No-store: esta imagen solo debe verse mientras la sesion tiene
    // membresia activa, nunca quedarse en el cache del navegador/CDN.
    res.set('Cache-Control', 'private, no-store');
    res.type('png').sendFile(rutaCache);
  } catch (e) {
    console.error(`[membresia] No se pudo generar la página ${numero} del eBook ${producto.id}:`, e.message);
    res.status(500).json({ error: 'No se pudo cargar esta página. Intenta de nuevo.' });
  }
});

module.exports = router;
module.exports.sincronizarPagosDePreapproval = sincronizarPagosDePreapproval;
module.exports.sincronizarEstadoDePreapproval = sincronizarEstadoDePreapproval;
