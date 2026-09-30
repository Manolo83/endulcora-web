const express = require('express');
const path = require('path');
const fs = require('fs');
const { MercadoPagoConfig, PreApproval } = require('mercadopago');
const store = require('../store');
const { SITE_URL, UPLOAD_DIR } = require('../config');
const { requireCliente } = require('./auth');
const { contarPaginasPDF, generarPaginaLecturaPDF } = require('../caratula');

const router = express.Router();

const PRECIO_MEMBRESIA = 100;

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
        notification_url: `${SITE_URL}/api/membresia/webhook`,
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

  const nuevoEstado = MAPA_ESTADO_PREAPPROVAL[info.status] || info.status;
  if (usuario.membresiaEstado === nuevoEstado && usuario.membresiaPreapprovalId === String(info.id)) return false;

  const patch = { membresiaEstado: nuevoEstado, membresiaPreapprovalId: String(info.id) };
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
  store.updateUser(usuario.id, patch);
  return true;
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
// recetario/revista mensual: revisa la membresia en cada solicitud y se
// sirve "inline" para leerse dentro de la misma pagina.
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
  res.setHeader('Content-Disposition', `inline; filename="${(clase.recetarioNombre || `Recetario${path.extname(filename)}`).replace(/"/g, '')}"`);
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
