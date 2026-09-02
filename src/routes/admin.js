const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const sharp = require('sharp');
const store = require('../store');
const { requireAdmin, checkPassword } = require('../auth');
const { UPLOAD_DIR, SITE_URL } = require('../config');
const { generarCaratulaPDF } = require('../caratula');
const { enviarCorreoRevistaMensual } = require('../email');
const { procesarCampana } = require('../campanas');
const { sincronizarPagosDePreapproval, sincronizarEstadoDePreapproval } = require('./membresia');

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

router.post('/api/promos-taller/:id/imagen', requireAdmin, uploadImage.single('file'), procesarImagenSubida, (req, res) => {
  const promo = store.getPromosTaller().find((p) => p.id === Number(req.params.id));
  if (!promo) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(404).json({ error: 'No encontrado' });
  }
  if (!req.file) return res.status(400).json({ error: 'Falta el archivo' });
  const anteriorFilename = promo.filename;
  const item = store.updatePromoTaller(req.params.id, { url: `/uploads/${req.file.filename}`, filename: req.file.filename });
  if (anteriorFilename) fs.unlink(path.join(UPLOAD_DIR, anteriorFilename), () => {});
  res.status(201).json(item);
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

// Revisa que el archivo que se entrega al comprar cada producto exista de
// verdad en el volumen (y no solo que el producto tenga algo guardado en el
// campo "archivo") — util para detectar archivos perdidos de antes de que se
// corrigiera DATA_DIR, sin tener que volver a subir todo por si acaso.
router.get('/api/products/verificar-archivos', requireAdmin, (req, res) => {
  const resultado = store.getProducts().map((p) => {
    if (!p.archivo) {
      return { id: p.id, titulo: p.titulo, categoria: p.categoria, estado: 'sin_archivo' };
    }
    const existe = fs.existsSync(path.join(UPLOAD_DIR, path.basename(p.archivo)));
    return {
      id: p.id,
      titulo: p.titulo,
      categoria: p.categoria,
      archivoNombre: p.archivoNombre,
      estado: existe ? 'ok' : 'faltante',
    };
  });
  res.json(resultado);
});

function sanearProductosRelacionados(body, excludeId) {
  let saneado = body;
  if (Array.isArray(body.productosRelacionados)) {
    const idsValidos = new Set(
      store.getProducts().filter((p) => p.id !== Number(excludeId)).map((p) => p.id)
    );
    saneado = {
      ...saneado,
      productosRelacionados: [...new Set(body.productosRelacionados.map(Number))].filter((id) => idsValidos.has(id)),
    };
  }
  if ('esPaquete' in body) {
    saneado = { ...saneado, esPaquete: body.esPaquete === true };
  }
  return saneado;
}

router.post('/api/products', requireAdmin, (req, res) => {
  const item = store.addProduct(sanearProductosRelacionados(req.body || {}));
  res.status(201).json(item);
});

router.patch('/api/products/:id', requireAdmin, (req, res) => {
  const item = store.updateProduct(req.params.id, sanearProductosRelacionados(req.body || {}, req.params.id));
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

// ---- Galería de fotos extra por producto (para su página propia /ebooks/slug) ----
router.post('/api/products/:id/galeria', requireAdmin, uploadImage.single('file'), procesarImagenSubida, (req, res) => {
  const producto = store.getProduct(req.params.id);
  if (!producto) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(404).json({ error: 'No encontrado' });
  }
  if (!req.file) return res.status(400).json({ error: 'Falta el archivo' });
  const item = store.addProductoGaleriaImagen(req.params.id, {
    url: `/uploads/${req.file.filename}`,
    filename: req.file.filename,
  });
  res.status(201).json(item);
});

router.delete('/api/products/:id/galeria/:imagenId', requireAdmin, (req, res) => {
  const eliminada = store.deleteProductoGaleriaImagen(req.params.id, req.params.imagenId);
  if (eliminada && eliminada.filename) {
    fs.unlink(path.join(UPLOAD_DIR, eliminada.filename), () => {});
  }
  res.json({ ok: true });
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

// ---- Ventas (pedidos de Mercado Pago + cobros de membresia) ----
router.get('/api/orders', requireAdmin, (req, res) => {
  const pedidos = store.getOrders();
  const pagosMembresia = store.getMembresiaPagos().map((p) => ({
    id: `membresia-${p.id}`,
    estado: p.estado,
    createdAt: p.createdAt,
    items: [{ cantidad: 1, titulo: 'Membresía Endulcora (mensual)', precio: p.monto }],
    total: p.monto,
    email: p.email || 'sin correo',
  }));
  const todos = [...pedidos, ...pagosMembresia].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(todos);
});

// Trae de Mercado Pago los cobros de membresia que falten por registrar
// (por ejemplo, los de antes de que existiera este registro, o si algun
// aviso del webhook no llego). Repara el historial contable sin depender
// solo del webhook.
router.post('/api/membresia/sincronizar-pagos', requireAdmin, async (req, res) => {
  // Ojo: esto incluye a cualquier cliente que ALGUNA VEZ haya tenido una
  // suscripcion (aunque ya la haya cancelado o pausado) — el id de Mercado
  // Pago no se borra al cancelar, se necesita para poder seguir viendo su
  // historial de cobros pasados. No es lo mismo que "suscripciones activas
  // ahora mismo" (para eso, compara con el numero que se ve en Mercado Pago).
  const usuarios = store.getUsers().filter((u) => u.membresiaPreapprovalId);
  let agregados = 0;
  let corregidos = 0;
  for (const usuario of usuarios) {
    agregados += await sincronizarPagosDePreapproval(usuario.membresiaPreapprovalId, usuario);
    // Ademas del historial de pagos, trae el estado REAL de la suscripcion
    // desde Mercado Pago y lo aplica localmente — repara a cualquier
    // cliente cuyo aviso de webhook nunca haya llegado (por ejemplo, quien
    // se suscribio antes de que se configurara notification_url) y se haya
    // quedado sin acceso a pesar de tener el cobro aprobado.
    if (await sincronizarEstadoDePreapproval(usuario.membresiaPreapprovalId)) corregidos += 1;
  }
  const activos = store.getUsers().filter((u) => u.membresiaEstado === 'activa').length;
  res.json({ agregados, corregidos, usuariosRevisados: usuarios.length, activos });
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
  const { sedeId, fecha, titulo, estado } = req.body || {};
  if (!sedeId || !fecha || !titulo) return res.status(400).json({ error: 'Falta sede, fecha o título' });
  res.status(201).json(store.addSesionTaller({ sedeId, fecha, titulo, estado }));
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

// ---- Comunidad: publicaciones del admin, con comentarios de clientes ----
router.get('/api/comunidad/publicaciones', requireAdmin, (req, res) => {
  res.json(store.getPublicacionesComunidad());
});

router.post('/api/comunidad/publicaciones', requireAdmin, (req, res) => {
  const titulo = String((req.body && req.body.titulo) || '').trim();
  const texto = String((req.body && req.body.texto) || '').trim();
  if (!titulo) return res.status(400).json({ error: 'Ponle un título a la publicación.' });
  const item = store.addPublicacionComunidad({ titulo, texto });
  res.status(201).json(item);
});

router.post('/api/comunidad/publicaciones/:id/imagen', requireAdmin, uploadImage.single('file'), procesarImagenSubida, (req, res) => {
  const publicacion = store.getPublicacionComunidad(req.params.id);
  if (!publicacion) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(404).json({ error: 'No encontrada' });
  }
  if (!req.file) return res.status(400).json({ error: 'Falta el archivo' });
  const url = `/uploads/${req.file.filename}`;
  const anterior = publicacion.imagen;
  const item = store.updatePublicacionComunidad(req.params.id, { imagen: url, imagenNombre: req.file.originalname });
  borrarSiEsSubida(anterior);
  res.status(201).json(item);
});

router.delete('/api/comunidad/publicaciones/:id', requireAdmin, (req, res) => {
  const item = store.deletePublicacionComunidad(req.params.id);
  if (item) borrarSiEsSubida(item.imagen);
  res.json({ ok: true });
});

router.get('/api/comunidad/publicaciones/:id/mensajes', requireAdmin, (req, res) => {
  res.json(store.getMensajesComunidad(req.params.id));
});

router.delete('/api/comunidad/mensajes/:id', requireAdmin, (req, res) => {
  store.deleteMensajeComunidad(req.params.id);
  res.json({ ok: true });
});

// ---- Clientes: lista para /admin (tabla) y para exportar audiencia (Meta Ads) ----
router.get('/api/users', requireAdmin, (req, res) => {
  const usuarios = store.getUsers().map((u) => {
    const digitos = String(u.telefono || '').replace(/\D/g, '');
    // Antepone el codigo de pais (52, Mexico) para mejorar el match en Meta.
    const telefonoConLada = digitos.length === 10 ? `52${digitos}` : digitos;
    return {
      id: u.id,
      email: u.email,
      nombre: u.nombre || '',
      telefono: telefonoConLada,
      membresiaEstado: u.membresiaEstado || 'ninguna',
    };
  });
  res.json(usuarios);
});

// ---- Clientes: restablecer contraseña olvidada (manual, vía WhatsApp) ----
router.get('/api/users/buscar', requireAdmin, (req, res) => {
  const q = String(req.query.q || req.query.email || '').trim().toLowerCase();
  if (!q) return res.status(400).json({ error: 'Escribe un correo o nombre para buscar.' });
  const coincidencias = store.getUsers().filter((u) =>
    u.email.toLowerCase().includes(q) || (u.nombre || '').toLowerCase().includes(q)
  );
  if (!coincidencias.length) return res.status(404).json({ error: 'No encontré ninguna cuenta con ese correo o nombre.' });
  res.json(coincidencias.slice(0, 20).map((user) => ({
    id: user.id,
    email: user.email,
    nombre: user.nombre,
    telefono: user.telefono || '',
    membresiaEstado: user.membresiaEstado || 'ninguna',
  })));
});

// ---- Clientes: dar o quitar membresia a mano (fuera del cobro de Mercado
// Pago) — por ejemplo, cortesias o pagos que el cliente hizo por otro medio.
const ESTADOS_MEMBRESIA_VALIDOS = ['ninguna', 'activa', 'pausada', 'cancelada'];
router.post('/api/users/:id/membresia', requireAdmin, (req, res) => {
  const { estado } = req.body || {};
  if (!ESTADOS_MEMBRESIA_VALIDOS.includes(estado)) {
    return res.status(400).json({ error: 'Estado de membresía no válido.' });
  }
  const user = store.getUserById(req.params.id);
  if (!user) return res.status(404).json({ error: 'No encontrado' });
  const patch = { membresiaEstado: estado };
  // Igual que en el webhook de Mercado Pago: solo reinicia el "reloj" de la
  // biblioteca de clases si de verdad estaba inactiva antes.
  if (estado === 'activa' && user.membresiaEstado !== 'activa') {
    patch.membresiaActivaDesde = new Date().toISOString().slice(0, 10);
  }
  const actualizado = store.updateUser(user.id, patch);
  res.json({ id: actualizado.id, membresiaEstado: actualizado.membresiaEstado });
});

// ---- Clientes: editar sus datos (nombre, correo, telefono) ----
const EMAIL_RE_ADMIN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
router.patch('/api/users/:id', requireAdmin, (req, res) => {
  const user = store.getUserById(req.params.id);
  if (!user) return res.status(404).json({ error: 'No encontrado' });

  const { nombre, email, telefono } = req.body || {};
  const patch = {};

  if (typeof nombre === 'string') {
    if (!nombre.trim()) return res.status(400).json({ error: 'El nombre no puede quedar vacío.' });
    patch.nombre = nombre.trim();
  }
  if (typeof email === 'string' && email.trim()) {
    const nuevoEmail = email.trim().toLowerCase();
    if (!EMAIL_RE_ADMIN.test(nuevoEmail)) return res.status(400).json({ error: 'Escribe un correo válido.' });
    if (nuevoEmail !== user.email) {
      const existente = store.getUserByEmail(nuevoEmail);
      if (existente && existente.id !== user.id) {
        return res.status(409).json({ error: 'Ya hay otra cuenta con ese correo.' });
      }
      patch.email = nuevoEmail;
    }
  }
  if (typeof telefono === 'string') {
    const digitos = telefono.replace(/\D/g, '');
    if (digitos && digitos.length !== 10) {
      return res.status(400).json({ error: 'El teléfono debe tener 10 dígitos (o déjalo vacío).' });
    }
    patch.telefono = digitos;
  }

  const actualizado = store.updateUser(user.id, patch);
  res.json({
    id: actualizado.id,
    email: actualizado.email,
    nombre: actualizado.nombre,
    telefono: actualizado.telefono || '',
    membresiaEstado: actualizado.membresiaEstado || 'ninguna',
  });
});

// Borra la cuenta del cliente (login + acceso). No borra su historial de
// pedidos ni de cobros de membresia, que quedan para la contabilidad.
router.delete('/api/users/:id', requireAdmin, (req, res) => {
  const item = store.deleteUser(req.params.id);
  if (!item) return res.status(404).json({ error: 'No encontrado' });
  res.json({ ok: true });
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

// ---- Regalo mensual: revista mensual por correo a todos los clientes ----
router.post('/api/regalo-mensual/enviar', requireAdmin, uploadDocumento.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Falta el archivo de la revista.' });
  const mes = String((req.body && req.body.mes) || '').trim() || 'este mes';
  const url = `${SITE_URL}/uploads/${req.file.filename}`;
  const usuarios = store.getUsers();
  let enviados = 0;
  const fallidos = [];
  for (const u of usuarios) {
    if (!u.email) continue;
    try {
      await enviarCorreoRevistaMensual({ to: u.email, nombre: u.nombre, url, mes });
      enviados++;
    } catch (e) {
      fallidos.push(u.email);
    }
    // Pausa breve entre envios para no chocar con el limite de tasa de Resend.
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  res.json({ total: usuarios.length, enviados, fallidos });
});

// ---- Membresia: recetario del mes + video del taller (contenido exclusivo) ----
router.get('/api/membresia/contenido', requireAdmin, (req, res) => {
  res.json(store.getContenidoMembresia());
});

router.post('/api/membresia/contenido', requireAdmin, (req, res) => {
  const { recetarioMes, videoYoutubeId, videoTitulo, videoMes, revistaNumero } = req.body || {};
  const patch = {};
  if (typeof recetarioMes === 'string') patch.recetarioMes = recetarioMes.trim();
  if (typeof videoYoutubeId === 'string') patch.videoYoutubeId = videoYoutubeId.trim();
  if (typeof videoTitulo === 'string') patch.videoTitulo = videoTitulo.trim();
  if (typeof videoMes === 'string') patch.videoMes = videoMes.trim();
  if (typeof revistaNumero === 'string') patch.revistaNumero = revistaNumero.trim();
  res.json(store.updateContenidoMembresia(patch));
});

router.post('/api/membresia/recetario', requireAdmin, uploadDocumento.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Falta el archivo del recetario.' });
  const anterior = store.getContenidoMembresia().recetarioUrl;
  const item = store.updateContenidoMembresia({
    recetarioUrl: `/uploads/${req.file.filename}`,
    recetarioNombre: req.file.originalname,
  });
  borrarSiEsSubida(anterior);
  // Mismo archivo para el producto "Recetario del mes" ($100, en /inicio):
  // se mantiene sincronizado con lo que se sube aqui, sin subirlo dos veces.
  const productoRecetario = store.getProductBySlug('recetario-del-mes');
  if (productoRecetario) {
    store.updateProduct(productoRecetario.id, {
      archivo: item.recetarioUrl,
      archivoNombre: item.recetarioNombre,
    });
  }
  res.json(item);
});

router.post('/api/membresia/revista', requireAdmin, uploadDocumento.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Falta el archivo de la revista.' });
  const anterior = store.getContenidoMembresia().revistaUrl;
  const item = store.updateContenidoMembresia({
    revistaUrl: `/uploads/${req.file.filename}`,
    revistaNombre: req.file.originalname,
  });
  borrarSiEsSubida(anterior);
  res.json(item);
});

// ---- Biblioteca de clases en vivo grabadas (exclusiva para miembros) ----
// El admin pega el link de YouTube de la grabacion y aqui se extrae solo el
// ID del video (lo que necesita el reproductor), sea cual sea el formato del
// link que haya copiado (youtu.be, watch?v=, live/, etc.).
function extraerIdYoutube(texto) {
  const m = String(texto || '').match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|live\/|shorts\/))([a-zA-Z0-9_-]{6,})/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9_-]{6,20}$/.test(String(texto || '').trim())) return String(texto).trim();
  return '';
}

router.get('/api/clases/biblioteca', requireAdmin, (req, res) => {
  res.json(store.getBibliotecaClases());
});

router.post('/api/clases/biblioteca', requireAdmin, (req, res) => {
  const { titulo, descripcion, youtubeUrl, fecha } = req.body || {};
  if (!titulo || !String(titulo).trim()) return res.status(400).json({ error: 'Ponle un título a la clase.' });
  const youtubeId = extraerIdYoutube(youtubeUrl);
  if (!youtubeId) return res.status(400).json({ error: 'Pega un link válido de YouTube.' });
  const item = store.addClaseBiblioteca({ titulo, descripcion, youtubeId, fecha });
  res.status(201).json(item);
});

router.delete('/api/clases/biblioteca/:id', requireAdmin, (req, res) => {
  store.deleteClaseBiblioteca(req.params.id);
  res.json({ ok: true });
});

// Recetario que acompaña a una clase grabada de la biblioteca (opcional, se
// puede subir/reemplazar despues de crear la clase). Se lee dentro de la
// misma pagina de /biblioteca-clases, igual que la revista mensual.
router.post('/api/clases/biblioteca/:id/recetario', requireAdmin, uploadDocumento.single('file'), (req, res) => {
  const clase = store.getBibliotecaClases().find((c) => c.id === Number(req.params.id));
  if (!clase) return res.status(404).json({ error: 'No se encontró esa clase.' });
  if (!req.file) return res.status(400).json({ error: 'Falta el archivo del recetario.' });
  const anterior = clase.recetarioUrl;
  const item = store.updateClaseBiblioteca(clase.id, {
    recetarioUrl: `/uploads/${req.file.filename}`,
    recetarioNombre: req.file.originalname,
  });
  borrarSiEsSubida(anterior);
  res.json(item);
});

// ---- Campañas de correo masivo (lista propia de contactos, vía Resend) ----
function escapeHtmlAdmin(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Parser de CSV sin depender de una librería externa: soporta campos entre
// comillas (con comas o comillas escapadas adentro), que es lo único que
// necesitamos para un archivo de contactos exportado de Excel/Sheets.
function parseCSV(texto) {
  const filas = [];
  let fila = [];
  let campo = '';
  let dentroComillas = false;
  const limpio = String(texto || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < limpio.length; i++) {
    const ch = limpio[i];
    if (dentroComillas) {
      if (ch === '"') {
        if (limpio[i + 1] === '"') { campo += '"'; i++; } else dentroComillas = false;
      } else {
        campo += ch;
      }
    } else if (ch === '"') {
      dentroComillas = true;
    } else if (ch === ',') {
      fila.push(campo); campo = '';
    } else if (ch === '\n') {
      fila.push(campo); campo = '';
      filas.push(fila); fila = [];
    } else {
      campo += ch;
    }
  }
  if (campo || fila.length) { fila.push(campo); filas.push(fila); }
  return filas.filter((f) => f.some((c) => c.trim() !== ''));
}

// Acepta encabezados en español o inglés, en cualquier orden. Regresa null
// si no encuentra una columna de correo (la única obligatoria).
function filasAContactos(filas) {
  if (!filas.length) return null;
  const encabezado = filas[0].map((h) => h.trim().toLowerCase());
  const idxEmail = encabezado.findIndex((h) => ['email', 'correo', 'mail', 'e-mail', 'correo electronico', 'correo electrónico'].includes(h));
  if (idxEmail === -1) return null;
  const idxNombre = encabezado.findIndex((h) => ['nombre', 'name', 'nombre completo'].includes(h));
  const idxTelefono = encabezado.findIndex((h) => ['telefono', 'teléfono', 'phone', 'celular', 'whatsapp'].includes(h));
  return filas.slice(1).map((fila) => ({
    email: fila[idxEmail] || '',
    nombre: idxNombre !== -1 ? fila[idxNombre] || '' : '',
    telefono: idxTelefono !== -1 ? fila[idxTelefono] || '' : '',
  }));
}

const uploadCSV = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB, de sobra para varios miles de contactos
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.mimetype === 'application/vnd.ms-excel' || /\.csv$/i.test(file.originalname)) cb(null, true);
    else cb(new Error('Sube un archivo .csv (en Excel o Google Sheets: Archivo > Descargar/Exportar > CSV).'));
  },
});

router.post('/api/campanas/importar', requireAdmin, uploadCSV.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Falta el archivo CSV.' });
  const filas = parseCSV(req.file.buffer.toString('utf-8'));
  const contactos = filasAContactos(filas);
  if (contactos === null) {
    return res.status(400).json({ error: 'No encontré una columna de correo. Pon un encabezado "email" o "correo" en la primera fila.' });
  }
  const resultado = store.importarContactosCampana(contactos);
  res.status(201).json(resultado);
});

router.get('/api/campanas/contactos', requireAdmin, (req, res) => {
  res.json(store.getContactosCampana());
});

// Agregar un contacto uno por uno a mano (ademas de la importacion masiva
// por CSV). Reusa importarContactosCampana para que, si el correo ya
// existia, solo se actualicen sus datos en vez de duplicarlo.
router.post('/api/campanas/contactos', requireAdmin, (req, res) => {
  const { email, nombre, telefono } = req.body || {};
  if (!email || !EMAIL_RE_ADMIN.test(String(email).trim())) {
    return res.status(400).json({ error: 'Escribe un correo válido.' });
  }
  const resultado = store.importarContactosCampana([{ email, nombre, telefono }]);
  res.status(201).json(resultado);
});

router.delete('/api/campanas/contactos/:id', requireAdmin, (req, res) => {
  store.deleteContactoCampana(req.params.id);
  res.json({ ok: true });
});

// ---- Adjuntos de campaña (imagen incrustada + archivo adjunto) ----
// Los videos NO se suben aqui: un video pesa demasiado para mandarlo de
// verdad a miles de correos (la mayoria de los clientes de correo ni
// siquiera lo reproducen adjunto) y arriesga que el correo caiga en spam.
// En vez de eso, la campaña solo guarda un link (YouTube, o una pagina del
// sitio) y en el correo aparece como un boton "Ver video".
const uploadAdjuntoArchivo = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB: ya es un archivo pesado para mandarlo a miles de correos
  fileFilter: (req, file, cb) => {
    if (ALLOWED_DOCUMENTO.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Tipo de archivo no permitido. Usa PDF, Excel, ZIP o HTML.'));
  },
});

const MAX_IMAGENES_CAMPANA = 6;
const MAX_ARCHIVOS_CAMPANA = 5;

router.post('/api/campanas/adjuntos/imagenes', requireAdmin, uploadImage.array('files', MAX_IMAGENES_CAMPANA), async (req, res) => {
  if (!req.files || !req.files.length) return res.status(400).json({ error: 'Falta el archivo.' });
  for (const file of req.files) {
    await new Promise((resolve) => procesarImagenSubida({ file }, res, resolve));
  }
  res.status(201).json(req.files.map((f) => ({ url: `/uploads/${f.filename}` })));
});

router.post('/api/campanas/adjuntos/archivos', requireAdmin, uploadAdjuntoArchivo.array('files', MAX_ARCHIVOS_CAMPANA), (req, res) => {
  if (!req.files || !req.files.length) return res.status(400).json({ error: 'Falta el archivo.' });
  res.status(201).json(req.files.map((f) => ({ url: `/uploads/${f.filename}`, nombre: f.originalname })));
});

// El envio se hace en segundo plano (puede tardar varios minutos con miles
// de contactos): la respuesta regresa de inmediato con el id de la campaña,
// y /admin consulta el progreso con GET /api/campanas. Todo el contenido y
// la lista de destinatarios se guardan en la campaña ANTES de mandar nada,
// para que si el servidor se reinicia a la mitad (ej. un deploy), se pueda
// retomar exactamente donde se quedo en vez de perderse (ver src/campanas.js).
router.post('/api/campanas/enviar', requireAdmin, (req, res) => {
  const { asunto, cuerpo, contactoIds, imagenes, archivos, videoUrl } = req.body || {};
  if (!asunto || !String(asunto).trim()) return res.status(400).json({ error: 'Ponle un asunto al correo.' });
  if (!cuerpo || !String(cuerpo).trim()) return res.status(400).json({ error: 'Escribe el contenido del correo.' });
  if (videoUrl && !/^https?:\/\//i.test(String(videoUrl).trim())) {
    return res.status(400).json({ error: 'El link del video debe empezar con http:// o https://' });
  }

  let destinatarios = store.getContactosCampana().filter((c) => c.activo !== false);
  if (Array.isArray(contactoIds)) {
    const idsSeleccionados = new Set(contactoIds.map(Number));
    destinatarios = destinatarios.filter((c) => idsSeleccionados.has(c.id));
  }
  if (!destinatarios.length) return res.status(400).json({ error: 'No hay contactos seleccionados a quién enviarle.' });

  const asuntoLimpio = String(asunto).trim();
  const cuerpoHtml = String(cuerpo).trim()
    .split(/\n{2,}/)
    .map((parrafo) => `<p style="margin:0 0 14px;">${escapeHtmlAdmin(parrafo).replace(/\n/g, '<br>')}</p>`)
    .join('');
  // Las imagenes/archivos suben como ruta relativa (/uploads/...); el correo
  // necesita la URL completa para que se vea/descargue fuera del sitio.
  const imagenesCompletas = Array.isArray(imagenes) ? imagenes.slice(0, MAX_IMAGENES_CAMPANA).map((u) => `${SITE_URL}${u}`) : [];
  const archivosCompletos = Array.isArray(archivos)
    ? archivos.slice(0, MAX_ARCHIVOS_CAMPANA).map((a) => ({ filename: a.nombre || 'archivo', path: `${SITE_URL}${a.url}` }))
    : [];
  const videoUrlLimpia = videoUrl ? String(videoUrl).trim() : '';

  const campana = store.addCampanaCorreo({
    asunto: asuntoLimpio,
    cuerpoHtml,
    imagenes: imagenesCompletas,
    archivos: archivosCompletos,
    videoUrl: videoUrlLimpia,
    contactoIds: destinatarios.map((c) => c.id),
  });
  res.status(202).json(campana);
  procesarCampana(campana.id).catch(() => {});
});

router.get('/api/campanas', requireAdmin, (req, res) => {
  res.json(store.getCampanasCorreo());
});

// Detiene una campaña que sigue en curso (ej. se mandó por error a más
// contactos de los que se querían). Ya no se le manda a nadie más; a quien
// ya se le mandó, se le mandó — eso no se puede deshacer.
router.post('/api/campanas/:id/cancelar', requireAdmin, (req, res) => {
  const campana = store.getCampanaCorreo(req.params.id);
  if (!campana) return res.status(404).json({ error: 'No encontrada' });
  if (campana.estado === 'terminada') return res.status(400).json({ error: 'Esta campaña ya había terminado.' });
  const actualizada = store.actualizarCampanaCorreo(campana.id, { estado: 'cancelada', terminadaAt: new Date().toISOString() });
  res.json(actualizada);
});

// ---- Manejo de errores (ej. archivo demasiado grande, tipo no permitido) ----
router.use((err, req, res, next) => {
  res.status(400).json({ error: err.message || 'Error al procesar la solicitud' });
});

module.exports = router;
