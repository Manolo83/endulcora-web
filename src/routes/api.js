const express = require('express');
const path = require('path');
const store = require('../store');
const { UPLOAD_DIR } = require('../config');

const router = express.Router();

router.get('/announcements', (req, res) => {
  res.json(store.getAnnouncements(true));
});

router.get('/media', (req, res) => {
  res.json(store.getMedia());
});

router.get('/content', (req, res) => {
  res.json(store.getContent());
});

router.get('/products', (req, res) => {
  res.json(store.getProducts());
});

router.get('/cursos', (req, res) => {
  res.json(store.getCursos());
});

router.get('/hero-carrusel', (req, res) => {
  res.json(store.getHeroCarrusel());
});

router.get('/sedes', (req, res) => {
  res.json(store.getSedes());
});

router.get('/sesiones-taller', (req, res) => {
  res.json(store.getSesionesTaller(req.query.sedeId));
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
router.post('/newsletter/suscribir', (req, res) => {
  const email = String((req.body && req.body.email) || '').trim();
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Escribe un correo válido.' });
  store.addSubscriber(email);
  res.status(201).json({ ok: true });
});

router.get('/pedidos/:orderId/descarga/:itemIndex', (req, res) => {
  const order = store.getOrder(req.params.orderId);
  if (!order || order.estado !== 'aprobado') {
    return res.status(404).send('Pedido no encontrado.');
  }
  if (!order.descargaToken || req.query.token !== order.descargaToken) {
    return res.status(403).send('Enlace no válido.');
  }
  const item = (order.items || [])[Number(req.params.itemIndex)];
  if (!item || item.tipo !== 'producto') {
    return res.status(404).send('Artículo no encontrado.');
  }
  const producto = store.getProduct(item.itemId);
  if (!producto || !producto.archivo) {
    return res.status(404).send('Este artículo todavía no tiene un archivo disponible. Escríbenos por WhatsApp.');
  }
  const filename = path.basename(producto.archivo);
  const nombreDescarga = producto.archivoNombre || `${producto.titulo || 'archivo'}${path.extname(filename)}`;
  res.download(path.join(UPLOAD_DIR, filename), nombreDescarga);
});

module.exports = router;
