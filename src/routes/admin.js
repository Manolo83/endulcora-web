const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const store = require('../store');
const { requireAdmin, checkPassword } = require('../auth');
const { UPLOAD_DIR } = require('../config');

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

function borrarSiEsSubida(url) {
  if (typeof url === 'string' && url.startsWith('/uploads/')) {
    fs.unlink(path.join(UPLOAD_DIR, path.basename(url)), () => {});
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

router.post('/api/media/upload', requireAdmin, upload.single('file'), (req, res) => {
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

const CAMPOS_IMAGEN_CONTENIDO = ['hero_imagen'];
router.post('/api/content/:key/image', requireAdmin, uploadImage.single('file'), (req, res) => {
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

router.post('/api/products/:id/image', requireAdmin, uploadImage.single('file'), (req, res) => {
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

// ---- Cursos y talleres ----
router.get('/api/cursos', requireAdmin, (req, res) => {
  res.json(store.getCursos());
});

router.post('/api/cursos', requireAdmin, (req, res) => {
  const item = store.addCurso(req.body || {});
  res.status(201).json(item);
});

router.patch('/api/cursos/:id', requireAdmin, (req, res) => {
  const item = store.updateCurso(req.params.id, req.body || {});
  if (!item) return res.status(404).json({ error: 'No encontrado' });
  res.json(item);
});

router.delete('/api/cursos/:id', requireAdmin, (req, res) => {
  store.deleteCurso(req.params.id);
  res.json({ ok: true });
});

// ---- Manejo de errores (ej. archivo demasiado grande, tipo no permitido) ----
router.use((err, req, res, next) => {
  res.status(400).json({ error: err.message || 'Error al procesar la solicitud' });
});

module.exports = router;
