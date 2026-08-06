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

// ---- Manejo de errores (ej. archivo demasiado grande, tipo no permitido) ----
router.use((err, req, res, next) => {
  res.status(400).json({ error: err.message || 'Error al procesar la solicitud' });
});

module.exports = router;
