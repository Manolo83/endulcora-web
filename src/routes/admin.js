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

// ---- Clientes: lista basica para exportar audiencia (Meta Ads, etc.) ----
router.get('/api/users', requireAdmin, (req, res) => {
  const usuarios = store.getUsers().map((u) => {
    const digitos = String(u.telefono || '').replace(/\D/g, '');
    // Antepone el codigo de pais (52, Mexico) para mejorar el match en Meta.
    const telefonoConLada = digitos.length === 10 ? `52${digitos}` : digitos;
    return { email: u.email, nombre: u.nombre || '', telefono: telefonoConLada };
  });
  res.json(usuarios);
});

// ---- Clientes: restablecer contraseña olvidada (manual, vía WhatsApp) ----
router.get('/api/users/buscar', requireAdmin, (req, res) => {
  const user = store.getUserByEmail(req.query.email || '');
  if (!user) return res.status(404).json({ error: 'No hay ninguna cuenta con ese correo.' });
  res.json({ id: user.id, email: user.email, nombre: user.nombre, telefono: user.telefono || '' });
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
  const { recetarioMes, videoYoutubeId, videoTitulo, videoMes } = req.body || {};
  const patch = {};
  if (typeof recetarioMes === 'string') patch.recetarioMes = recetarioMes.trim();
  if (typeof videoYoutubeId === 'string') patch.videoYoutubeId = videoYoutubeId.trim();
  if (typeof videoTitulo === 'string') patch.videoTitulo = videoTitulo.trim();
  if (typeof videoMes === 'string') patch.videoMes = videoMes.trim();
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
  res.json(item);
});

// ---- Manejo de errores (ej. archivo demasiado grande, tipo no permitido) ----
router.use((err, req, res, next) => {
  res.status(400).json({ error: err.message || 'Error al procesar la solicitud' });
});

module.exports = router;
