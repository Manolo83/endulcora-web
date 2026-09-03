const express = require('express');
const path = require('path');
const fs = require('fs');
const store = require('../store');
const { UPLOAD_DIR, GOOGLE_ADS, SITE_URL } = require('../config');
const { requireCliente } = require('./auth');
const { uploadImage, uploadMedia, procesarImagenSubida, ALLOWED_VIDEO } = require('../uploads');
const { enviarCorreoLeadMagnetPaso0 } = require('../email');

function sumarDias(dias) {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() + dias);
  return fecha.toISOString();
}

const router = express.Router();

// El sitio pregunta aqui que etiquetas de medicion debe cargar, para no tener
// que tocar el HTML cada vez que cambia un ID. Si GOOGLE_ADS_ID esta vacio, el
// sitio simplemente no carga nada de Google.
router.get('/medicion', (req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json({
    googleAdsId: GOOGLE_ADS.medicionId,
    conversionCompra: GOOGLE_ADS.conversionCompra,
  });
});

router.get('/announcements', (req, res) => {
  res.json(store.getAnnouncements(true));
});

router.get('/media', (req, res) => {
  res.json(store.getMedia().filter((m) => m.estado === 'aprobado'));
});

// Foto que sube un cliente para la galeria (queda pendiente de aprobar).
router.post('/galeria/subir', requireCliente, uploadImage.single('file'), procesarImagenSubida, (req, res) => {
  const user = store.getUserById(req.session.userId);
  if (!user) return res.status(401).json({ error: 'Tienes que iniciar sesión.' });
  if (!req.file) return res.status(400).json({ error: 'Sube una foto.' });
  const item = store.addMediaCliente({
    userId: user.id,
    nombreAutor: user.nombre,
    url: `/uploads/${req.file.filename}`,
    filename: req.file.filename,
    title: (req.body && req.body.titulo) || '',
  });
  res.status(201).json(item);
});

router.get('/galeria/:id/comentarios', (req, res) => {
  const item = store.getMedia().find((m) => m.id === Number(req.params.id));
  if (!item) return res.status(404).json({ error: 'No se encontró esa foto.' });
  res.json(store.getComentariosGaleria(req.params.id));
});

router.post('/galeria/:id/comentarios', requireCliente, (req, res) => {
  const item = store.getMedia().find((m) => m.id === Number(req.params.id));
  if (!item) return res.status(404).json({ error: 'No se encontró esa foto.' });
  const user = store.getUserById(req.session.userId);
  if (!user) return res.status(401).json({ error: 'Tienes que iniciar sesión.' });
  const texto = String((req.body && req.body.texto) || '').trim();
  if (!texto) return res.status(400).json({ error: 'Escribe un comentario.' });
  if (texto.length > 1000) return res.status(400).json({ error: 'Tu comentario es muy largo (máximo 1000 caracteres).' });
  const comentario = store.addComentarioGaleria({
    mediaId: item.id,
    userId: user.id,
    nombre: user.nombre,
    texto,
    fotoAutor: user.fotoPerfilUrl || '',
  });
  res.status(201).json(comentario);
});

router.get('/content', (req, res) => {
  res.json(store.getContent());
});

// ---- Blog de recetas gratuitas ----
const PREFIJO_BLOG_POR_CATEGORIA = { ebook: 'ebooks', anexo: 'anexos', recetario: 'recetarios' };
function conProductoRelacionado(post) {
  if (!post.productoRelacionadoId) return { ...post, productoRelacionado: null };
  const producto = store.getProduct(post.productoRelacionadoId);
  if (!producto || producto.ocultoEnCatalogo) return { ...post, productoRelacionado: null };
  return {
    ...post,
    productoRelacionado: {
      titulo: producto.titulo,
      slug: producto.slug,
      prefijo: PREFIJO_BLOG_POR_CATEGORIA[producto.categoria] || 'ebooks',
    },
  };
}

router.get('/blog', (req, res) => {
  res.json(store.getBlogPosts(true).map(conProductoRelacionado));
});

router.get('/blog/:slug', (req, res) => {
  const post = store.getBlogPostBySlug(req.params.slug);
  if (!post || !post.publicado) return res.status(404).json({ error: 'No se encontró esa entrada.' });
  res.json(conProductoRelacionado(post));
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
    precioMembresia: r.precioMembresia || '',
    imagen: r.imagen,
    esPaquete: !!r.esPaquete,
    boton: r.boton || '',
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

router.get('/comunidad/publicaciones', (req, res) => {
  res.json(store.getPublicacionesComunidad().filter((p) => p.estado === 'aprobado'));
});

// Publicacion hecha por un cliente (foto o video + descripcion, como una
// red social): queda pendiente de aprobar, no se agrega al feed publico.
router.post('/comunidad/publicaciones', requireCliente, uploadMedia.single('archivo'), procesarImagenSubida, (req, res) => {
  const user = store.getUserById(req.session.userId);
  if (!user) return res.status(401).json({ error: 'Tienes que iniciar sesión.' });
  const texto = String((req.body && req.body.texto) || '').trim();
  if (!req.file) return res.status(400).json({ error: 'Sube una foto o un video.' });
  if (texto.length > 1000) return res.status(400).json({ error: 'Tu descripción es muy larga (máximo 1000 caracteres).' });

  const esVideo = ALLOWED_VIDEO.includes(req.file.mimetype);
  const item = store.addPublicacionComunidadCliente({
    userId: user.id,
    nombreAutor: user.nombre,
    fotoAutor: user.fotoPerfilUrl || '',
    texto,
    imagen: esVideo ? '' : `/uploads/${req.file.filename}`,
    imagenNombre: esVideo ? null : req.file.filename,
    video: esVideo ? `/uploads/${req.file.filename}` : '',
    videoNombre: esVideo ? req.file.filename : '',
  });
  res.status(201).json(item);
});

router.get('/comunidad/publicaciones/:id/mensajes', (req, res) => {
  const publicacion = store.getPublicacionComunidad(req.params.id);
  if (!publicacion) return res.status(404).json({ error: 'Publicación no encontrada.' });
  res.json(store.getMensajesComunidad(req.params.id));
});

router.post('/comunidad/publicaciones/:id/mensajes', requireCliente, uploadImage.single('imagen'), procesarImagenSubida, (req, res) => {
  const publicacion = store.getPublicacionComunidad(req.params.id);
  if (!publicacion) return res.status(404).json({ error: 'Publicación no encontrada.' });
  const user = store.getUserById(req.session.userId);
  if (!user) return res.status(401).json({ error: 'Tienes que iniciar sesión.' });
  const texto = String((req.body && req.body.texto) || '').trim();
  if (!texto && !req.file) return res.status(400).json({ error: 'Escribe un comentario o adjunta una foto.' });
  if (texto.length > 1000) return res.status(400).json({ error: 'Tu comentario es muy largo (máximo 1000 caracteres).' });
  const item = store.addMensajeComunidad({
    publicacionId: publicacion.id,
    userId: user.id,
    nombre: user.nombre,
    texto,
    imagen: req.file ? `/uploads/${req.file.filename}` : '',
    imagenNombre: req.file ? req.file.filename : '',
    fotoAutor: user.fotoPerfilUrl || '',
  });
  res.status(201).json(item);
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
router.post('/newsletter/suscribir', async (req, res) => {
  const correo = String((req.body && req.body.email) || '').trim();
  if (!EMAIL_RE.test(correo)) return res.status(400).json({ error: 'Escribe un correo válido.' });
  const { item: sub, nuevo } = store.addSubscriber(correo);
  res.status(201).json({ ok: true });

  // El correo de la receta gratis (paso 0 del lead magnet) se manda aparte,
  // despues de responder, para no hacer esperar al visitante a que Resend
  // conteste. Solo aplica a suscripciones nuevas y si el admin ya subio un
  // PDF de regalo — si no, la persona simplemente queda en la lista.
  if (!nuevo) return;
  const contenido = store.getContent();
  if (!contenido.leadmagnet_pdf_url) return;
  try {
    await enviarCorreoLeadMagnetPaso0({
      to: sub.email,
      titulo: contenido.leadmagnet_titulo,
      url: `${SITE_URL}${contenido.leadmagnet_pdf_url}`,
      unsubscribeUrl: `${SITE_URL}/desuscribir-correos?id=${sub.id}&token=${sub.unsubToken}`,
    });
    store.updateSubscriber(sub.id, { leadMagnetPaso: 1, leadMagnetProximoEnvio: sumarDias(2) });
  } catch (e) {
    console.error('No se pudo mandar la receta de regalo a', sub.email, e.message);
  }
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
