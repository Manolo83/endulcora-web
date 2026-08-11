const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const sharp = require('sharp');
const store = require('../store');
const botAlmacen = require('../bot/almacen');
const canales = require('../bot/canales');
const { requireAdmin, checkPassword } = require('../auth');
const { UPLOAD_DIR } = require('../config');
const { generarCaratulaPDF } = require('../caratula');

const router = express.Router();

const ALLOWED_IMAGE = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_VIDEO = ['video/mp4', 'video/webm', 'video/quicktime'];

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 150 * 1024 * 1024 }, // 150MB
  fileFilter: (req, file, cb) => {
    if ([...ALLOWED_IMAGE, ...ALLOWED_VIDEO].includes(file.mimetype)) cb(null, true);
    else cb(new Error('Tipo de archivo no permitido. Usa JPG, PNG, WEBP, GIF, MP4, WEBM o MOV.'));
  },
});

const uploadImage = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB, suficiente para fotos de producto/hero
  fileFilter: (req, file, cb) => {
    if (ALLOWED_IMAGE.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Tipo de archivo no permitido. Usa JPG, PNG, WEBP o GIF.'));
  },
});

const ALLOWED_DOCUMENTO = [
  'application/pdf',
  'application/zip',
  'application/x-zip-compressed',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/html',
];
const uploadDocumento = multer({
  storage,
  limits: { fileSize: 80 * 1024 * 1024 }, // 80MB, suficiente para eBooks/anexos
  fileFilter: (req, file, cb) => {
    if (ALLOWED_DOCUMENTO.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Tipo de archivo no permitido. Usa PDF, Excel, ZIP o HTML.'));
  },
});

// Las fotos subidas desde el celular suelen venir a resolucion de camara
// (varios MB, 4000px+). Eso hace que muchos celulares no puedan decodificarlas
// (se ven como "imagen rota"), aunque en computadora carguen bien. Aqui se
// redimensionan y comprimen antes de guardarlas, para que se vean bien en
// cualquier dispositivo y carguen mas rapido.
const IMAGEN_LADO_MAXIMO = 2000;
async function procesarImagenSubida(req, res, next) {
  if (!req.file || !ALLOWED_IMAGE.includes(req.file.mimetype) || req.file.mimetype === 'image/gif') {
    return next();
  }
  try {
    const ruta = req.file.path;
    const metadata = await sharp(ruta).metadata();
    let imagen = sharp(ruta)
      .rotate() // aplica la orientacion EXIF de la camara y la deja fija en los pixeles
      .resize({ width: IMAGEN_LADO_MAXIMO, height: IMAGEN_LADO_MAXIMO, fit: 'inside', withoutEnlargement: true });
    if (metadata.format === 'png') imagen = imagen.png({ quality: 82, compressionLevel: 8 });
    else if (metadata.format === 'webp') imagen = imagen.webp({ quality: 82 });
    else imagen = imagen.jpeg({ quality: 82, mozjpeg: true });

    const buffer = await imagen.toBuffer();
    fs.writeFileSync(ruta, buffer);
    req.file.size = buffer.length;
  } catch (e) {
    console.error('No se pudo redimensionar la imagen subida, se guarda tal cual:', e.message);
  }
  next();
}

function borrarSiEsSubida(url) {
  if (typeof url === 'string' && url.startsWith('/uploads/')) {
    fs.unlink(path.join(UPLOAD_DIR, path.basename(url)), () => {});
  }
}

// Genera la carátula de un PDF (primera página), la comprime y la guarda como
// imagen subida; regresa su URL o null si no se pudo generar.
async function generarYGuardarCaratula(rutaPDF) {
  const buffer = await generarCaratulaPDF(rutaPDF);
  if (!buffer) return null;
  try {
    const comprimido = await sharp(buffer).png({ quality: 82, compressionLevel: 8 }).toBuffer();
    const nombreImagen = `${crypto.randomUUID()}.png`;
    fs.writeFileSync(path.join(UPLOAD_DIR, nombreImagen), comprimido);
    return `/uploads/${nombreImagen}`;
  } catch (e) {
    console.error('No se pudo guardar la carátula generada:', e.message);
    return null;
  }
}

// ---- Autenticacion ----
router.post('/login', (req, res) => {
  const { password } = req.body || {};
  if (!checkPassword(password)) {
    return res.status(401).json({ error: 'Contrasena incorrecta' });
  }
  req.session.isAdmin = true;
  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

router.get('/api/session', (req, res) => {
  res.json({ isAdmin: !!(req.session && req.session.isAdmin) });
});

// ---- Anuncios ----
router.get('/api/announcements', requireAdmin, (req, res) => {
  res.json(store.getAnnouncements(false));
});

router.post('/api/announcements', requireAdmin, (req, res) => {
  const { title, body, published } = req.body || {};
  if (!title || !body) return res.status(400).json({ error: 'Falta titulo o contenido' });
  const item = store.addAnnouncement({ title, body, published });
  res.status(201).json(item);
});

router.patch('/api/announcements/:id', requireAdmin, (req, res) => {
  const item = store.updateAnnouncement(req.params.id, req.body || {});
  if (!item) return res.status(404).json({ error: 'No encontrado' });
  res.json(item);
});

router.delete('/api/announcements/:id', requireAdmin, (req, res) => {
  store.deleteAnnouncement(req.params.id);
  res.json({ ok: true });
});

// ---- Galeria (fotos y video) ----
router.get('/api/media', requireAdmin, (req, res) => {
  res.json(store.getMedia());
});

router.post('/api/media/upload', requireAdmin, upload.single('file'), procesarImagenSubida, (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Falta el archivo' });
  const kind = ALLOWED_VIDEO.includes(req.file.mimetype) ? 'video' : 'photo';
  const item = store.addMedia({
    kind,
    source: 'upload',
    url: `/uploads/${req.file.filename}`,
    title: req.body.title || '',
    filename: req.file.filename,
  });
  res.status(201).json(item);
});

router.post('/api/media/embed', requireAdmin, (req, res) => {
  const { url, title } = req.body || {};
  if (!url) return res.status(400).json({ error: 'Falta la URL del video' });
  const item = store.addMedia({ kind: 'video', source: 'embed', url, title: title || '' });
  res.status(201).json(item);
});

router.delete('/api/media/:id', requireAdmin, (req, res) => {
  const item = store.deleteMedia(req.params.id);
  if (item && item.source === 'upload' && item.filename) {
    fs.unlink(path.join(UPLOAD_DIR, item.filename), () => {});
  }
  res.json({ ok: true });
});

// ---- Contenido general del sitio ----
router.get('/api/content', requireAdmin, (req, res) => {
  res.json(store.getContent());
});

router.patch('/api/content', requireAdmin, (req, res) => {
  const item = store.updateContent(req.body || {});
  res.json(item);
});

const CAMPOS_IMAGEN_CONTENIDO = ['chef_imagen', 'asistente_icono'];
router.post('/api/content/:key/image', requireAdmin, uploadImage.single('file'), procesarImagenSubida, (req, res) => {
  const { key } = req.params;
  if (!CAMPOS_IMAGEN_CONTENIDO.includes(key)) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: 'Campo de imagen no valido' });
  }
  if (!req.file) return res.status(400).json({ error: 'Falta el archivo' });
  const anterior = store.getContent()[key];
  const url = `/uploads/${req.file.filename}`;
  const content = store.updateContent({ [key]: url });
  borrarSiEsSubida(anterior);
  res.status(201).json({ url, content });
});

router.delete('/api/content/:key/image', requireAdmin, (req, res) => {
  const { key } = req.params;
  if (!CAMPOS_IMAGEN_CONTENIDO.includes(key)) return res.status(400).json({ error: 'Campo de imagen no valido' });
  const anterior = store.getContent()[key];
  const content = store.updateContent({ [key]: '' });
  borrarSiEsSubida(anterior);
  res.json({ content });
});

// ---- Carrusel de imagenes del inicio (publicidad) ----
router.get('/api/hero-carrusel', requireAdmin, (req, res) => {
  res.json(store.getHeroCarrusel());
});

router.post('/api/hero-carrusel/upload', requireAdmin, uploadImage.single('file'), procesarImagenSubida, (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Falta el archivo' });
  const item = store.addHeroCarruselImagen({
    url: `/uploads/${req.file.filename}`,
    filename: req.file.filename,
    titulo: req.body.title || '',
  });
  res.status(201).json(item);
});

router.patch('/api/hero-carrusel/:id', requireAdmin, (req, res) => {
  const item = store.updateHeroCarruselImagen(req.params.id, req.body || {});
  if (!item) return res.status(404).json({ error: 'No encontrado' });
  res.json(item);
});

router.delete('/api/hero-carrusel/:id', requireAdmin, (req, res) => {
  const item = store.deleteHeroCarruselImagen(req.params.id);
  if (item && item.filename) {
    fs.unlink(path.join(UPLOAD_DIR, item.filename), () => {});
  }
  res.json({ ok: true });
});

// ---- Promos semanales de talleres (carrusel de anuncios) ----
router.get('/api/promos-taller', requireAdmin, (req, res) => {
  res.json(store.getPromosTaller());
});

router.post('/api/promos-taller/upload', requireAdmin, uploadImage.single('file'), procesarImagenSubida, (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Falta el archivo' });
  const item = store.addPromoTaller({
    url: `/uploads/${req.file.filename}`,
    filename: req.file.filename,
    titulo: req.body.titulo || '',
    descripcion: req.body.descripcion || '',
  });
  res.status(201).json(item);
});

router.patch('/api/promos-taller/:id', requireAdmin, (req, res) => {
  const item = store.updatePromoTaller(req.params.id, req.body || {});
  if (!item) return res.status(404).json({ error: 'No encontrado' });
  res.json(item);
});

router.delete('/api/promos-taller/:id', requireAdmin, (req, res) => {
  const item = store.deletePromoTaller(req.params.id);
  if (item && item.filename) {
    fs.unlink(path.join(UPLOAD_DIR, item.filename), () => {});
  }
  res.json({ ok: true });
});

// ---- Productos de la tienda ----
router.get('/api/products', requireAdmin, (req, res) => {
  res.json(store.getProducts());
});

router.post('/api/products', requireAdmin, (req, res) => {
  const item = store.addProduct(req.body || {});
  res.status(201).json(item);
});

router.patch('/api/products/:id', requireAdmin, (req, res) => {
  const item = store.updateProduct(req.params.id, req.body || {});
  if (!item) return res.status(404).json({ error: 'No encontrado' });
  res.json(item);
});

router.delete('/api/products/:id', requireAdmin, (req, res) => {
  const item = store.deleteProduct(req.params.id);
  if (item) borrarSiEsSubida(item.imagen);
  res.json({ ok: true });
});

router.post('/api/products/:id/image', requireAdmin, uploadImage.single('file'), procesarImagenSubida, (req, res) => {
  const producto = store.getProduct(req.params.id);
  if (!producto) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(404).json({ error: 'No encontrado' });
  }
  if (!req.file) return res.status(400).json({ error: 'Falta el archivo' });
  const url = `/uploads/${req.file.filename}`;
  const anterior = producto.imagen;
  const item = store.updateProduct(req.params.id, { imagen: url });
  borrarSiEsSubida(anterior);
  res.status(201).json(item);
});

router.post('/api/products/:id/archivo', requireAdmin, uploadDocumento.single('file'), async (req, res) => {
  const producto = store.getProduct(req.params.id);
  if (!producto) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(404).json({ error: 'No encontrado' });
  }
  if (!req.file) return res.status(400).json({ error: 'Falta el archivo' });
  const url = `/uploads/${req.file.filename}`;
  const anterior = producto.archivo;
  const patch = { archivo: url, archivoNombre: req.file.originalname };

  // Si es un PDF y todavía no hay imagen puesta a mano, usamos la primera
  // página como carátula. Si el administrador ya eligió una imagen, se respeta.
  if (req.file.mimetype === 'application/pdf' && !producto.imagen) {
    const caratula = await generarYGuardarCaratula(req.file.path);
    if (caratula) patch.imagen = caratula;
  }

  const item = store.updateProduct(req.params.id, patch);
  borrarSiEsSubida(anterior);
  res.status(201).json(item);
});

router.delete('/api/products/:id/archivo', requireAdmin, (req, res) => {
  const producto = store.getProduct(req.params.id);
  if (!producto) return res.status(404).json({ error: 'No encontrado' });
  const anterior = producto.archivo;
  const item = store.updateProduct(req.params.id, { archivo: '', archivoNombre: '' });
  borrarSiEsSubida(anterior);
  res.json(item);
});

// Carga masiva: varios archivos a la vez, cada uno con su propio nombre y
// precio. Crea un producto por archivo; si es PDF, genera su carátula sola.
router.post('/api/products/subir-lote', requireAdmin, uploadDocumento.array('archivos', 20), async (req, res) => {
  if (!req.files || !req.files.length) return res.status(400).json({ error: 'Selecciona al menos un archivo' });
  const categoria = ['ebook', 'anexo', 'recetario'].includes(req.body.categoria) ? req.body.categoria : 'ebook';
  let titulos = [];
  let precios = [];
  try { titulos = JSON.parse(req.body.titulos || '[]'); } catch (e) { titulos = []; }
  try { precios = JSON.parse(req.body.precios || '[]'); } catch (e) { precios = []; }

  const creados = [];
  for (let i = 0; i < req.files.length; i++) {
    const file = req.files[i];
    const titulo = (titulos[i] && String(titulos[i]).trim()) || path.parse(file.originalname).name;
    const precio = precios[i] != null ? String(precios[i]).trim() : '';

    let item = store.addProduct({
      categoria,
      titulo,
      precio,
      archivo: `/uploads/${file.filename}`,
      archivoNombre: file.originalname,
    });

    if (file.mimetype === 'application/pdf') {
      const caratula = await generarYGuardarCaratula(file.path);
      if (caratula) item = store.updateProduct(item.id, { imagen: caratula }) || item;
    }

    creados.push(item);
  }
  res.status(201).json(creados);
});

// ---- Ventas (pedidos de Mercado Pago) ----
router.get('/api/orders', requireAdmin, (req, res) => {
  res.json(store.getOrders());
});

// ---- Suscriptores del correo (footer) ----
router.get('/api/newsletter', requireAdmin, (req, res) => {
  res.json(store.getSubscribers());
});

// ---- Sedes (calendario de talleres presenciales) ----
router.get('/api/sedes', requireAdmin, (req, res) => {
  res.json(store.getSedes());
});

router.post('/api/sedes', requireAdmin, (req, res) => {
  const { nombre } = req.body || {};
  if (!nombre || !String(nombre).trim()) return res.status(400).json({ error: 'Falta el nombre de la sede' });
  res.status(201).json(store.addSede(nombre));
});

router.patch('/api/sedes/:id', requireAdmin, (req, res) => {
  const item = store.updateSede(req.params.id, req.body || {});
  if (!item) return res.status(404).json({ error: 'No encontrado' });
  res.json(item);
});

router.delete('/api/sedes/:id', requireAdmin, (req, res) => {
  store.deleteSede(req.params.id);
  res.json({ ok: true });
});

router.post('/api/sedes/:id/imagen', requireAdmin, uploadImage.single('file'), procesarImagenSubida, (req, res) => {
  const sede = store.getSedes().find((s) => s.id === Number(req.params.id));
  if (!sede) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(404).json({ error: 'No encontrado' });
  }
  if (!req.file) return res.status(400).json({ error: 'Falta el archivo' });
  const url = `/uploads/${req.file.filename}`;
  const anterior = sede.imagenFondo;
  const item = store.updateSede(req.params.id, { imagenFondo: url });
  borrarSiEsSubida(anterior);
  res.status(201).json(item);
});

router.delete('/api/sedes/:id/imagen', requireAdmin, (req, res) => {
  const sede = store.getSedes().find((s) => s.id === Number(req.params.id));
  if (!sede) return res.status(404).json({ error: 'No encontrado' });
  const anterior = sede.imagenFondo;
  const item = store.updateSede(req.params.id, { imagenFondo: '' });
  borrarSiEsSubida(anterior);
  res.json(item);
});

// ---- Calendario de talleres presenciales ----
router.get('/api/sesiones-taller', requireAdmin, (req, res) => {
  res.json(store.getSesionesTaller(req.query.sedeId));
});

router.post('/api/sesiones-taller', requireAdmin, (req, res) => {
  const { sedeId, fecha, titulo, estado, cupo, tallerBotId, horario } = req.body || {};
  if (!sedeId || !fecha || !titulo) return res.status(400).json({ error: 'Falta sede, fecha o título' });
  res.status(201).json(store.addSesionTaller({ sedeId, fecha, titulo, estado, cupo, tallerBotId, horario }));
});

router.patch('/api/sesiones-taller/:id', requireAdmin, (req, res) => {
  const item = store.updateSesionTaller(req.params.id, req.body || {});
  if (!item) return res.status(404).json({ error: 'No encontrado' });
  res.json(item);
});

router.delete('/api/sesiones-taller/:id', requireAdmin, (req, res) => {
  store.deleteSesionTaller(req.params.id);
  res.json({ ok: true });
});

// ---- Reseñas de alumnos (moderación) ----
router.get('/api/resenas', requireAdmin, (req, res) => {
  res.json(store.getResenas());
});

router.patch('/api/resenas/:id', requireAdmin, (req, res) => {
  const item = store.updateResena(req.params.id, req.body || {});
  if (!item) return res.status(404).json({ error: 'No encontrado' });
  res.json(item);
});

router.delete('/api/resenas/:id', requireAdmin, (req, res) => {
  store.deleteResena(req.params.id);
  res.json({ ok: true });
});

// ---- Clientes: restablecer contraseña olvidada (manual, vía WhatsApp) ----
/* ---------- Bot de comentarios de Meta ---------- */

router.get('/api/bot/config', requireAdmin, (req, res) => {
  res.json({ config: store.getBotConfig(), copys: store.getBotCopys() });
});

router.post('/api/bot/config', requireAdmin, (req, res) => {
  const { config, copys } = req.body || {};
  if (config) store.updateBotConfig(config);
  if (copys) store.updateBotCopys(copys);
  res.json({ config: store.getBotConfig(), copys: store.getBotCopys() });
});

router.get('/api/bot/talleres', requireAdmin, (req, res) => {
  res.json(store.getTalleresBot());
});

router.post('/api/bot/talleres', requireAdmin, (req, res) => {
  const { id, nombre, palabraClave, copy, precioRegular, precioPromo, activo, adIds } = req.body || {};
  if (!id && !String(nombre || '').trim()) {
    return res.status(400).json({ error: 'Ponle nombre al taller.' });
  }
  const item = id
    ? store.updateTallerBot(id, { nombre, palabraClave, copy, precioRegular, precioPromo, activo, adIds })
    : store.addTallerBot({ nombre, palabraClave, copy, precioRegular, precioPromo, adIds });
  if (!item) return res.status(404).json({ error: 'Ese taller ya no existe.' });
  res.status(id ? 200 : 201).json(item);
});

router.delete('/api/bot/talleres/:id', requireAdmin, (req, res) => {
  store.deleteTallerBot(req.params.id);
  res.json({ ok: true });
});

// Carga los 18 talleres del documento de ventas con sus fechas. Se puede
// repetir: solo agrega lo que falte, nunca pisa lo editado en el panel.
router.post('/api/bot/importar-semilla', requireAdmin, (req, res) => {
  const semilla = require('../bot/semilla');
  res.json(store.importarSemilla(semilla));
});

// Que le falta al bot para funcionar. Devuelve si cada llave esta puesta,
// nunca su valor: sirve para diagnosticar sin exponer nada.
router.get('/api/bot/diagnostico', requireAdmin, async (req, res) => {
  const hay = (n) => !!(process.env[n] && process.env[n].trim());
  let ultimoEvento = null;
  try {
    const r = await store.pool.query('SELECT max(ultimo_mensaje_at) AS ultimo FROM bot_contactos');
    ultimoEvento = r.rows[0] && r.rows[0].ultimo;
  } catch (e) {
    // Si la tabla aun no existe, el diagnostico igual debe responder.
  }

  res.json({
    botEncendido: store.getBotConfig().activo,
    talleres: store.getTalleresBot().filter((t) => t.activo !== false).length,
    llaves: {
      META_APP_SECRET: hay('META_APP_SECRET'),
      META_VERIFY_TOKEN: hay('META_VERIFY_TOKEN'),
      META_PAGE_TOKEN: hay('META_PAGE_TOKEN'),
      META_PAGE_ID: hay('META_PAGE_ID'),
      GEMINI_API_KEY: hay('GEMINI_API_KEY'),
      META_IG_ID: hay('META_IG_ID'),
      RESEND_API_KEY: hay('RESEND_API_KEY'),
    },
    ultimoEvento,
  });
});

// Suscribir la app a la pagina de Facebook. Es el enganche que no tiene boton
// en el panel de Meta y sin el cual los comentarios reales no llegan, aunque el
// webhook este dado de alta y el boton "Probar" funcione.
router.post('/api/bot/conectar-pagina', requireAdmin, async (req, res) => {
  const paginaId = String(process.env.META_PAGE_ID || '').replace(/\D/g, '');
  if (!paginaId) return res.status(400).json({ error: 'Falta META_PAGE_ID en el servidor.' });
  if (!canales.configurado('messenger')) {
    return res.status(400).json({ error: 'Falta META_PAGE_TOKEN en el servidor.' });
  }
  try {
    // Se tira el token guardado en memoria: si acabas de corregir la variable,
    // el boton debe usar el nuevo sin esperar a un redespliegue.
    canales.olvidarTokenPagina();
    res.json({ ok: true, apps: await canales.suscribirPagina(paginaId) });
  } catch (e) {
    res.status(502).json({ error: `Meta no aceptó la conexión: ${e.message}` });
  }
});

router.get('/api/bot/conexion-pagina', requireAdmin, async (req, res) => {
  const paginaId = String(process.env.META_PAGE_ID || '').replace(/\D/g, '');
  if (!paginaId || !canales.configurado('messenger')) return res.json({ paginaId, apps: null });
  try {
    res.json({ paginaId, apps: await canales.appsSuscritas(paginaId) });
  } catch (e) {
    res.json({ paginaId, apps: null, error: e.message });
  }
});

router.get('/api/bot/conversaciones', requireAdmin, async (req, res) => {
  try {
    res.json(await botAlmacen.listarConversaciones());
  } catch (e) {
    res.status(500).json({ error: 'No se pudieron cargar las conversaciones.' });
  }
});

// WhatsApp solo entrega texto libre dentro de las 24 h siguientes al ultimo
// mensaje del cliente. Messenger e Instagram tienen la misma regla, pero con
// mas holgura en la practica; aqui se aplica el limite estricto de WhatsApp
// solo a WhatsApp para no bloquear de mas.
const HORAS_VENTANA_WHATSAPP = 24;

function ventanaDe(contacto, ultimoCliente) {
  if (contacto.canal !== 'whatsapp') return { abierta: true, ultimoCliente };
  if (!ultimoCliente) return { abierta: false, ultimoCliente: null };
  const horas = (Date.now() - new Date(ultimoCliente).getTime()) / 3600000;
  return { abierta: horas <= HORAS_VENTANA_WHATSAPP, ultimoCliente, horasRestantes: Math.max(0, HORAS_VENTANA_WHATSAPP - horas) };
}

router.get('/api/bot/conversaciones/:id', requireAdmin, async (req, res) => {
  try {
    const contacto = await botAlmacen.contactoPorId(req.params.id);
    if (!contacto) return res.status(404).json({ error: 'Esa conversación no existe.' });
    const ultimoCliente = await botAlmacen.ultimoMensajeCliente(contacto.id);
    res.json({
      contacto,
      mensajes: await botAlmacen.mensajesDeContacto(contacto.id),
      ventana: ventanaDe(contacto, ultimoCliente),
      puedeEnviar: canales.configurado(contacto.canal),
    });
  } catch (e) {
    res.status(500).json({ error: 'No se pudo cargar la conversación.' });
  }
});

// Contestar tu mismo, por el mismo numero y dentro del mismo chat. El cliente
// no ve ningun cambio: para el es la misma conversacion de siempre.
router.post('/api/bot/conversaciones/:id/responder', requireAdmin, async (req, res) => {
  const texto = String((req.body && req.body.texto) || '').trim();
  if (!texto) return res.status(400).json({ error: 'Escribe algo antes de enviarlo.' });
  if (texto.length > 3500) return res.status(400).json({ error: 'El mensaje es muy largo: máximo 3500 caracteres.' });

  try {
    const contacto = await botAlmacen.contactoPorId(req.params.id);
    if (!contacto) return res.status(404).json({ error: 'Esa conversación no existe.' });
    if (contacto.estado === 'baja') {
      return res.status(400).json({ error: 'Esta persona pidió BAJA. No se le puede escribir.' });
    }
    if (!canales.configurado(contacto.canal)) {
      return res.status(400).json({ error: `Faltan las llaves de ${contacto.canal} en las variables del servidor.` });
    }

    const ventana = ventanaDe(contacto, await botAlmacen.ultimoMensajeCliente(contacto.id));
    if (!ventana.abierta) {
      return res.status(409).json({
        error:
          'Pasaron más de 24 horas desde el último mensaje de esta persona. WhatsApp ya no permite mandarle texto libre: hay que esperar a que escriba de nuevo.',
      });
    }

    await canales.enviarTexto({ canal: contacto.canal, destino: contacto.externo_id, texto });
    await botAlmacen.guardarMensaje(contacto.id, 'humano', texto);

    // Si contestas tu, la conversacion es tuya: el bot se calla hasta que se la
    // devuelvas. Asi no se atraviesa a media negociacion.
    const actualizado =
      contacto.estado === 'bot'
        ? await botAlmacen.actualizarContacto(contacto.id, {
            estado: 'humano',
            motivoEscalado: contacto.motivo_escalado || 'La estás atendiendo tú',
          })
        : contacto;

    res.json({
      contacto: actualizado,
      mensajes: await botAlmacen.mensajesDeContacto(contacto.id),
      ventana: ventanaDe(contacto, await botAlmacen.ultimoMensajeCliente(contacto.id)),
      puedeEnviar: true,
    });
  } catch (e) {
    res.status(502).json({ error: `No se pudo enviar: ${e.message}` });
  }
});

// Devolverle una conversacion al bot despues de haberla atendido a mano.
router.post('/api/bot/conversaciones/:id/reactivar', requireAdmin, async (req, res) => {
  try {
    const contacto = await botAlmacen.actualizarContacto(Number(req.params.id), { estado: 'bot', motivoEscalado: '' });
    if (!contacto) return res.status(404).json({ error: 'Esa conversación no existe.' });
    res.json(contacto);
  } catch (e) {
    res.status(500).json({ error: 'No se pudo reactivar.' });
  }
});

router.get('/api/users/buscar', requireAdmin, (req, res) => {
  const user = store.getUserByEmail(req.query.email || '');
  if (!user) return res.status(404).json({ error: 'No hay ninguna cuenta con ese correo.' });
  res.json({ id: user.id, email: user.email, nombre: user.nombre });
});

router.post('/api/users/:id/reset-password', requireAdmin, (req, res) => {
  const { password } = req.body || {};
  if (!password || String(password).length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
  }
  const user = store.getUserById(req.params.id);
  if (!user) return res.status(404).json({ error: 'No encontrado' });
  store.updateUser(user.id, { passwordHash: bcrypt.hashSync(String(password), 10) });
  res.json({ ok: true });
});

// ---- Manejo de errores (ej. archivo demasiado grande, tipo no permitido) ----
router.use((err, req, res, next) => {
  res.status(400).json({ error: err.message || 'Error al procesar la solicitud' });
});

module.exports = router;
