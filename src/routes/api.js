const express = require('express');
const path = require('path');
const fs = require('fs');
const store = require('../store');
const { UPLOAD_DIR } = require('../config');
const { requireCliente } = require('./auth');

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

const PREFIJO_POR_CATEGORIA = { ebook: 'ebooks', anexo: 'anexos', recetario: 'recetarios' };

function resumenProducto(r) {
  return {
    id: r.id,
    slug: r.slug,
    categoria: r.categoria,
    prefijo: PREFIJO_POR_CATEGORIA[r.categoria] || 'ebooks',
    titulo: r.titulo,
    descripcionCorta: r.descripcionCorta,
    precio: r.precio,
    imagen: r.imagen,
    esPaquete: !!r.esPaquete,
  };
}

router.get('/productos/:slug', (req, res) => {
  const producto = store.getProductBySlug(req.params.slug);
  if (!producto) return res.status(404).json({ error: 'No encontrado' });
  const relacionados = (producto.productosRelacionados || [])
    .map((id) => store.getProduct(id))
    .filter(Boolean)
    .map(resumenProducto);
  // Paquetes que incluyen este producto como componente, aunque el paquete
  // no lo tenga ligado desde este lado (se liga una sola vez, del paquete al componente).
  const paquetesQueLoIncluyen = store.getProducts()
    .filter((x) => x.esPaquete && x.id !== producto.id && (x.productosRelacionados || []).includes(producto.id))
    .map(resumenProducto);
  res.json({ ...producto, productosRelacionadosInfo: relacionados, paquetesQueLoIncluyen });
});

router.get('/hero-carrusel', (req, res) => {
  res.json(store.getHeroCarrusel());
});

router.get('/promos-taller', (req, res) => {
  res.json(store.getPromosTaller());
});

router.get('/sedes', (req, res) => {
  res.json(store.getSedes());
});

router.get('/sesiones-taller', (req, res) => {
  res.json(store.getSesionesTaller(req.query.sedeId));
});

router.get('/resenas', (req, res) => {
  res.json(store.getResenas(true));
});

router.get('/comunidad/mensajes', (req, res) => {
  res.json(store.getMensajesComunidad());
});

router.post('/comunidad/mensajes', requireCliente, (req, res) => {
  const user = store.getUserById(req.session.userId);
  if (!user) return res.status(401).json({ error: 'Tienes que iniciar sesión.' });
  const texto = String((req.body && req.body.texto) || '').trim();
  if (!texto) return res.status(400).json({ error: 'Escribe un mensaje.' });
  if (texto.length > 1000) return res.status(400).json({ error: 'Tu mensaje es muy largo (máximo 1000 caracteres).' });
  const item = store.addMensajeComunidad({ userId: user.id, nombre: user.nombre, texto });
  res.status(201).json(item);
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
router.post('/newsletter/suscribir', (req, res) => {
  const email = String((req.body && req.body.email) || '').trim();
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Escribe un correo válido.' });
  store.addSubscriber(email);
  res.status(201).json({ ok: true });
});

// Estado de un pedido para la pagina de gracias: requiere el viewToken que
// Mercado Pago devuelve en la URL (no es adivinable, a diferencia del id).
router.get('/pedidos/:orderId/estado', (req, res) => {
  const order = store.getOrder(req.params.orderId);
  if (!order || !order.viewToken || req.query.token !== order.viewToken) {
    return res.status(404).json({ error: 'Pedido no encontrado.' });
  }
  const aprobado = order.estado === 'aprobado';
  res.json({
    estado: order.estado,
    total: order.total,
    moneda: 'MXN',
    items: (order.items || []).map((item, i) => {
      const producto = item.tipo === 'producto' ? store.getProduct(item.itemId) : null;
      const archivoExiste = !!(producto && producto.archivo && fs.existsSync(path.join(UPLOAD_DIR, path.basename(producto.archivo))));
      return {
        index: i,
        itemId: item.itemId,
        titulo: item.titulo,
        cantidad: item.cantidad,
        precio: item.precio,
        descargaDisponible: aprobado && archivoExiste,
      };
    }),
    descargaToken: aprobado ? order.descargaToken : null,
  });
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
    return res.status(404).send('Este artículo todavía no tiene un archivo disponible. Escríbenos por WhatsApp al 5665271901.');
  }
  const filename = path.basename(producto.archivo);
  const rutaCompleta = path.join(UPLOAD_DIR, filename);
  if (!fs.existsSync(rutaCompleta)) {
    console.error(`[descarga] Falta el archivo de "${producto.titulo}" (producto ${producto.id}) en ${rutaCompleta}. Hay que volver a subirlo en /admin.`);
    return res.status(404).send('No pudimos encontrar tu archivo en este momento. Escríbenos por WhatsApp al 5665271901 y te lo mandamos directo.');
  }
  const nombreDescarga = producto.archivoNombre || `${producto.titulo || 'archivo'}${path.extname(filename)}`;
  res.download(rutaCompleta, nombreDescarga, (err) => {
    if (err && !res.headersSent) {
      console.error(`[descarga] Error al enviar el archivo de "${producto.titulo}":`, err.message);
      res.status(500).send('Ocurrió un error al preparar tu descarga. Escríbenos por WhatsApp al 5665271901.');
    }
  });
});

module.exports = router;
