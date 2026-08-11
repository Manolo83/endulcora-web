const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const sharp = require('sharp');
const store = require('../store');
const meta = require('../meta');
const { requireAdmin, checkPassword } = require('../auth');
const { UPLOAD_DIR } = require('../config');

const router = express.Router();

const ALLOWED_IMAGE = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const uploadImage = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_IMAGE.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Tipo de archivo no permitido. Usa JPG, PNG, WEBP o GIF.'));
  },
});

// Las fotos subidas desde el celular vienen a resolucion de camara (varios MB).
// Se redimensionan antes de guardarlas para que la landing cargue rapido: en
// una campana pagada, cada segundo de carga se traduce en visitantes perdidos
// que ya se cobraron.
const IMAGEN_LADO_MAXIMO = 1800;
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

// ---- Contenido de la landing ----

router.get('/api/content', requireAdmin, (req, res) => {
  res.json(store.getContent());
});

router.put('/api/content', requireAdmin, (req, res) => {
  res.json(store.updateContent(req.body || {}));
});

router.post('/api/content/imagen', requireAdmin, uploadImage.single('imagen'), procesarImagenSubida, (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se recibio ninguna imagen.' });
  const contenido = store.getContent();
  borrarSiEsSubida(contenido.hero_imagen);
  const url = `/uploads/${req.file.filename}`;
  store.updateContent({ hero_imagen: url });
  res.status(201).json({ url });
});

// ---- Ofertas ----

router.get('/api/ofertas', requireAdmin, (req, res) => {
  res.json(store.getOfertas(false));
});

router.post('/api/ofertas', requireAdmin, (req, res) => {
  res.status(201).json(store.addOferta(limpiarOferta(req.body || {})));
});

router.put('/api/ofertas/:id', requireAdmin, (req, res) => {
  const item = store.updateOferta(req.params.id, limpiarOferta(req.body || {}));
  if (!item) return res.status(404).json({ error: 'Oferta no encontrada' });
  res.json(item);
});

router.delete('/api/ofertas/:id', requireAdmin, (req, res) => {
  const item = store.getOferta(req.params.id);
  if (item) borrarSiEsSubida(item.imagen);
  store.deleteOferta(req.params.id);
  res.json({ ok: true });
});

router.post('/api/ofertas/:id/imagen', requireAdmin, uploadImage.single('imagen'), procesarImagenSubida, (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se recibio ninguna imagen.' });
  const item = store.getOferta(req.params.id);
  if (!item) return res.status(404).json({ error: 'Oferta no encontrada' });
  borrarSiEsSubida(item.imagen);
  const url = `/uploads/${req.file.filename}`;
  store.updateOferta(item.id, { imagen: url });
  res.status(201).json({ url });
});

function limpiarOferta(body) {
  const campos = {};
  for (const clave of ['etiqueta', 'titulo', 'subtitulo', 'descripcion', 'precio', 'precioAnterior', 'boton']) {
    if (typeof body[clave] === 'string') campos[clave] = body[clave].trim();
  }
  if (Array.isArray(body.bullets)) {
    campos.bullets = body.bullets.map((b) => String(b).trim()).filter(Boolean).slice(0, 8);
  }
  if (typeof body.activo === 'boolean') campos.activo = body.activo;
  if (Number.isFinite(Number(body.orden))) campos.orden = Number(body.orden);
  return campos;
}

// ---- Leads ----

router.get('/api/leads', requireAdmin, (req, res) => {
  res.json(store.getLeads());
});

router.put('/api/leads/:id', requireAdmin, (req, res) => {
  const patch = {};
  if (typeof req.body.atendido === 'boolean') patch.atendido = req.body.atendido;
  if (typeof req.body.notas === 'string') patch.notas = req.body.notas.slice(0, 1000);
  const item = store.updateLead(req.params.id, patch);
  if (!item) return res.status(404).json({ error: 'Lead no encontrado' });
  res.json(item);
});

router.delete('/api/leads/:id', requireAdmin, (req, res) => {
  store.deleteLead(req.params.id);
  res.json({ ok: true });
});

// Exportar a CSV: es como se sube una lista a Meta para publicos similares
// (lookalike) y como se pasa a quien haga el seguimiento comercial.
router.get('/api/leads.csv', requireAdmin, (req, res) => {
  const columnas = [
    'id', 'creadoEn', 'nombre', 'telefono', 'email', 'interes', 'mensaje',
    'origen', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'fbclid', 'atendido',
  ];
  const escapar = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const filas = store.getLeads().map((l) => columnas.map((c) => escapar(l[c])).join(','));
  // El BOM hace que Excel en Windows abra los acentos correctamente.
  const csv = '﻿' + [columnas.join(','), ...filas].join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="leads-levent.csv"');
  res.send(csv);
});

// ---- Ventas ----

router.get('/api/ventas', requireAdmin, (req, res) => {
  res.json(store.getOrders());
});

// ---- Diagnostico de la integracion con Meta ----
// Responde la pregunta que siempre surge a mitad de una campana: "esta
// midiendo o no?", sin tener que entrar al Administrador de eventos.

router.get('/api/meta/estado', requireAdmin, (req, res) => {
  const eventos = store.getEventosMeta();
  const ultimas24h = eventos.filter((e) => Date.now() - new Date(e.enviadoEn).getTime() < 24 * 60 * 60 * 1000);
  const porEvento = {};
  for (const e of ultimas24h) {
    porEvento[e.eventName] = porEvento[e.eventName] || { ok: 0, error: 0 };
    porEvento[e.eventName][e.ok ? 'ok' : 'error'] += 1;
  }

  res.json({
    pixelConfigurado: !!meta.pixelId(),
    capiConfigurada: meta.estaConfigurado(),
    modoPrueba: !!process.env.META_TEST_EVENT_CODE,
    pixelId: meta.pixelId() ? `...${meta.pixelId().slice(-4)}` : '',
    porEvento,
    ultimos: eventos.slice(0, 30),
  });
});

// Manda un evento de prueba a Meta desde el panel. Sirve para comprobar que el
// token sigue vivo: los tokens de la Conversions API se pueden invalidar al
// cambiar la contrasena de Facebook, y hasta ahora eso solo se nota cuando la
// campana lleva dias reportando de menos.
router.post('/api/meta/probar', requireAdmin, async (req, res) => {
  if (!meta.estaConfigurado()) {
    return res.status(503).json({ ok: false, motivo: 'Falta META_PIXEL_ID o META_ACCESS_TOKEN en las variables de entorno.' });
  }
  const eventId = meta.nuevoEventId('prueba');
  const resultado = await meta.enviarEvento({
    eventName: 'PageView',
    eventId,
    actionSource: 'website',
    navegador: meta.datosDelNavegador(req),
  });
  store.registrarEventoMeta({ eventName: 'PageView (prueba)', eventId, ok: resultado.ok, motivo: resultado.motivo });
  res.json(resultado);
});

// Multer manda un error normal (no HTTP) cuando el archivo es muy grande o del
// tipo equivocado; sin este manejador el panel solo mostraria "error 500".
router.use((err, req, res, next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'El archivo pesa demasiado.' });
  }
  if (err) return res.status(400).json({ error: err.message });
  next();
});

module.exports = router;
