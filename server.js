require('dotenv').config();

const path = require('path');
const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cookieSession = require('cookie-session');
const rateLimit = require('express-rate-limit');

const { UPLOAD_DIR, SITE_URL } = require('./src/config');
const store = require('./src/store');
const apiRoutes = require('./src/routes/api');
const adminRoutes = require('./src/routes/admin');
const checkoutRoutes = require('./src/routes/checkout');
const authRoutes = require('./src/routes/auth');
const asistenteRoutes = require('./src/routes/asistente');
const googleAdsRoutes = require('./src/routes/googleAds');
const membresiaRoutes = require('./src/routes/membresia');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
console.log(`[uploads] Los archivos subidos se guardan en: ${UPLOAD_DIR}`);
if (process.env.NODE_ENV === 'production' && !UPLOAD_DIR.startsWith('/data')) {
  console.error(
    `[uploads] AVISO: en produccion, UPLOAD_DIR deberia vivir dentro de /data (el Volume de Railway) para sobrevivir a cada despliegue. ` +
    `Ruta actual: ${UPLOAD_DIR}. Revisa la variable DATA_DIR en Railway (debe ser "/data", sin ruta relativa) o las imagenes que se suban se perderan en el proximo deploy.`
  );
}

const app = express();
app.set('trust proxy', 1);

// Tailwind (CDN) y los scripts inline del sitio original necesitan CSP relajado.
// referrerPolicy se relaja de "no-referrer" (default de helmet) a
// "strict-origin-when-cross-origin": sigue sin mandar la URL completa a
// otros sitios, pero manda el origen (https://www.endulcora.com), que
// YouTube necesita para autorizar la reproducción de videos no listados
// incrustados (sin esto tira el Error 153).
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  })
);
app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(
  cookieSession({
    name: 'endulcora_session',
    secret: process.env.SESSION_SECRET || 'cambia-esta-clave-en-las-variables-de-entorno',
    maxAge: 12 * 60 * 60 * 1000,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  })
);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Intenta de nuevo en unos minutos.' },
});
app.use('/admin/login', loginLimiter);

const clienteAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Intenta de nuevo en unos minutos.' },
});
app.use('/api/auth/login', clienteAuthLimiter);
app.use('/api/auth/register', clienteAuthLimiter);

const checkoutLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de compra. Intenta de nuevo en unos minutos.' },
});
app.use('/api/checkout/preference', checkoutLimiter);

const newsletterLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Intenta de nuevo en unos minutos.' },
});
app.use('/api/newsletter/suscribir', newsletterLimiter);

const asistenteLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas preguntas seguidas. Espera unos minutos.' },
});
app.use('/api/asistente/chat', asistenteLimiter);

const comunidadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Escribiste muchos mensajes muy rápido. Espera unos minutos.' },
});
app.use('/api/comunidad/publicaciones', (req, res, next) => (req.method === 'POST' && req.path.endsWith('/mensajes') ? comunidadLimiter(req, res, next) : next()));

// Panel de Google Ads: protegido por token propio (GOOGLE_ADS_ADMIN_TOKEN) y
// limitado, porque desde ahi se pueden crear cuentas y mover conversiones.
const googleAdsLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas peticiones al panel de Google Ads. Espera unos minutos.' },
});
app.use('/api/google-ads', googleAdsLimiter, googleAdsRoutes);

app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '30d' }));
// El contenido de /api cambia en cualquier momento desde /admin (precios,
// productos, disponibilidad...), asi que nunca debe quedar en cache de
// navegador, proxy o CDN intermedio.
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
app.use('/api/checkout', checkoutRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/asistente', asistenteRoutes);
app.use('/api/membresia', membresiaRoutes);
app.use('/api', apiRoutes);
app.use('/admin', adminRoutes);

// Pagina propia por producto (ej. /ebooks/velas-comestibles, /anexos/costeo):
// se sirve la misma plantilla para cualquier slug, pero se inyectan las
// etiquetas de meta/Open Graph en el servidor (con los datos reales del
// producto) para que se vean bien las vistas previas al compartir o anunciar.
const escaparHtml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const CATEGORIA_POR_PREFIJO = { ebooks: 'ebook', anexos: 'anexo', recetarios: 'recetario' };

function servirPaginaProducto(prefijo) {
  return (req, res) => {
    const producto = store.getProductBySlug(req.params.slug);
    if (!producto || producto.categoria !== CATEGORIA_POR_PREFIJO[prefijo]) {
      return res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
    }
    let html;
    try {
      html = fs.readFileSync(path.join(__dirname, 'public', 'producto.html'), 'utf8');
    } catch (e) {
      return res.status(500).send('No se pudo cargar la pagina del producto.');
    }
    const titulo = producto.titulo || 'Producto';
    const descripcion = (producto.descripcionCorta || producto.subtitulo || 'Producto de Endulcora, Estudio Gastronómico.').slice(0, 300);
    const imagen = producto.imagen
      ? (producto.imagen.startsWith('http') ? producto.imagen : `${SITE_URL}${producto.imagen}`)
      : `${SITE_URL}/og-image.png`;
    const url = `${SITE_URL}/${prefijo}/${producto.slug}`;
    html = html
      .replace(/__TITULO__/g, escaparHtml(titulo))
      .replace(/__DESCRIPCION__/g, escaparHtml(descripcion))
      .replace(/__IMAGEN__/g, escaparHtml(imagen))
      .replace(/__URL__/g, escaparHtml(url));
    res.send(html);
  };
}

app.get('/ebooks/:slug', servirPaginaProducto('ebooks'));
app.get('/anexos/:slug', servirPaginaProducto('anexos'));
app.get('/recetarios/:slug', servirPaginaProducto('recetarios'));

// Entrada del blog (ej. /blog/como-templar-chocolate): misma logica que
// servirPaginaProducto, pero para public/blog-post.html.
app.get('/blog/:slug', (req, res) => {
  const post = store.getBlogPostBySlug(req.params.slug);
  if (!post || !post.publicado) {
    return res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
  }
  let html;
  try {
    html = fs.readFileSync(path.join(__dirname, 'public', 'blog-post.html'), 'utf8');
  } catch (e) {
    return res.status(500).send('No se pudo cargar la entrada del blog.');
  }
  const titulo = post.titulo || 'Blog';
  const descripcion = (post.resumen || 'Recetas y consejos de Endulcora, Estudio Gastronómico.').slice(0, 300);
  const imagen = post.imagen
    ? (post.imagen.startsWith('http') ? post.imagen : `${SITE_URL}${post.imagen}`)
    : `${SITE_URL}/og-image.png`;
  const url = `${SITE_URL}/blog/${post.slug}`;
  html = html
    .replace(/__TITULO__/g, escaparHtml(titulo))
    .replace(/__DESCRIPCION__/g, escaparHtml(descripcion))
    .replace(/__IMAGEN__/g, escaparHtml(imagen))
    .replace(/__URL__/g, escaparHtml(url));
  res.send(html);
});

app.get('/blog', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'blog.html'));
});

// Paginas de catalogo, propias y separadas de la pagina principal (para
// anunciar sin que la gente tenga que bajar por todo el sitio).
app.get(['/tienda', '/ebooks', '/anexos', '/recetarios'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'categoria.html'));
});

app.get('/calendario', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'calendario.html'));
});

app.get('/galeria', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'galeria.html'));
});

app.get('/membresia', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'membresia.html'));
});

app.get('/clases-en-vivo', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'clases-en-vivo.html'));
});

app.get('/biblioteca-clases', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'biblioteca-clases.html'));
});

app.get('/juego', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'juego.html'));
});

// Baja de la lista de campañas de correo. Sirve el link visible al final de
// cada correo (GET, para que la persona vea la confirmación) y también
// responde a POST: los clientes de correo que soportan "un clic para darse
// de baja" (Gmail, Yahoo) lo hacen con un POST silencioso, sin abrir nada.
function manejarDesuscripcion(req, res) {
  const { id, token } = req.method === 'POST' ? req.body || {} : req.query;
  const item = store.desuscribirContactoCampanaPorToken(id, token);
  if (req.method === 'POST') return res.status(200).end();
  res.set('Content-Type', 'text/html; charset=utf-8');
  if (!item) {
    return res.status(400).send('<!DOCTYPE html><html lang="es-MX"><meta charset="utf-8"><body style="font-family:Arial,sans-serif;max-width:420px;margin:80px auto;text-align:center;color:#1B0720;"><h1>Enlace no válido</h1><p>Este enlace para dejar de recibir correos ya no es válido.</p></body></html>');
  }
  const correoSeguro = String(item.email).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  res.send(`<!DOCTYPE html><html lang="es-MX"><meta charset="utf-8"><body style="font-family:Arial,sans-serif;max-width:420px;margin:80px auto;text-align:center;color:#1B0720;"><h1>Listo</h1><p>${correoSeguro} ya no recibirá correos de Endulcora.</p></body></html>`);
}
app.get('/desuscribir', manejarDesuscripcion);
app.post('/desuscribir', express.urlencoded({ extended: false }), manejarDesuscripcion);

// Baja de la lista del footer (newsletter/lead magnet). Misma logica que la
// de arriba, pero para src/store.js#subscribers (una lista aparte de la de
// campañas masivas importadas en /admin).
function manejarDesuscripcionCorreos(req, res) {
  const { id, token } = req.method === 'POST' ? req.body || {} : req.query;
  const item = store.desuscribirSubscriberPorToken(id, token);
  if (req.method === 'POST') return res.status(200).end();
  res.set('Content-Type', 'text/html; charset=utf-8');
  if (!item) {
    return res.status(400).send('<!DOCTYPE html><html lang="es-MX"><meta charset="utf-8"><body style="font-family:Arial,sans-serif;max-width:420px;margin:80px auto;text-align:center;color:#1B0720;"><h1>Enlace no válido</h1><p>Este enlace para dejar de recibir correos ya no es válido.</p></body></html>');
  }
  const correoSeguro = String(item.email).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  res.send(`<!DOCTYPE html><html lang="es-MX"><meta charset="utf-8"><body style="font-family:Arial,sans-serif;max-width:420px;margin:80px auto;text-align:center;color:#1B0720;"><h1>Listo</h1><p>${correoSeguro} ya no recibirá correos de Endulcora.</p></body></html>`);
}
app.get('/desuscribir-correos', manejarDesuscripcionCorreos);
app.post('/desuscribir-correos', express.urlencoded({ extended: false }), manejarDesuscripcionCorreos);

// Secciones que se quedan dentro de la pagina principal, pero con URL propia
// ademas de las anclas #seccion. Sirven la misma index.html; el script del
// cliente hace scroll a la seccion segun la ruta.
app.get(
  ['/calculadora', '/resenas', '/anuncios'],
  (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
);

// Mapa de vuelta de categoria -> prefijo de URL (lo contrario de
// CATEGORIA_POR_PREFIJO, usado en servirPaginaProducto).
const PREFIJO_POR_CATEGORIA = { ebook: 'ebooks', anexo: 'anexos', recetario: 'recetarios' };

// Sitemap generado en cada solicitud (no un archivo estatico) para que
// siempre incluya los productos que existen en este momento — nunca se
// queda desactualizado cuando se agrega o se borra un producto desde
// /admin. Solo incluye productos visibles en el catalogo (los "satelite"
// como Anexo/App/Paquete solo se compran desde la pagina del eBook
// principal, no son una entrada de busqueda pensada para llegar sola) y
// con titulo real (evita listar productos de prueba sin terminar).
app.get('/sitemap.xml', (req, res) => {
  const paginasEstaticas = [
    { loc: '/', prioridad: '1.0', frecuencia: 'weekly' },
    { loc: '/tienda', prioridad: '0.8', frecuencia: 'weekly' },
    { loc: '/ebooks', prioridad: '0.8', frecuencia: 'weekly' },
    { loc: '/anexos', prioridad: '0.8', frecuencia: 'weekly' },
    { loc: '/recetarios', prioridad: '0.8', frecuencia: 'weekly' },
    { loc: '/calendario', prioridad: '0.6', frecuencia: 'weekly' },
    { loc: '/galeria', prioridad: '0.5', frecuencia: 'weekly' },
    { loc: '/membresia', prioridad: '0.6', frecuencia: 'monthly' },
    { loc: '/clases-en-vivo', prioridad: '0.6', frecuencia: 'weekly' },
    { loc: '/biblioteca-clases', prioridad: '0.5', frecuencia: 'weekly' },
    { loc: '/comunidad', prioridad: '0.4', frecuencia: 'weekly' },
    { loc: '/juego', prioridad: '0.4', frecuencia: 'monthly' },
    { loc: '/calculadora', prioridad: '0.5', frecuencia: 'monthly' },
    { loc: '/resenas', prioridad: '0.5', frecuencia: 'monthly' },
    { loc: '/anuncios', prioridad: '0.4', frecuencia: 'weekly' },
    { loc: '/blog', prioridad: '0.7', frecuencia: 'weekly' },
  ];

  const paginasDeProducto = store.getProducts()
    .filter((p) => !p.ocultoEnCatalogo && p.titulo && p.titulo.trim() && p.slug)
    .map((p) => ({
      loc: `/${PREFIJO_POR_CATEGORIA[p.categoria] || 'ebooks'}/${p.slug}`,
      prioridad: '0.7',
      frecuencia: 'monthly',
    }));

  const paginasDeBlog = store.getBlogPosts(true)
    .filter((p) => p.titulo && p.titulo.trim() && p.slug)
    .map((p) => ({ loc: `/blog/${p.slug}`, prioridad: '0.6', frecuencia: 'monthly' }));

  const urls = [...paginasEstaticas, ...paginasDeProducto, ...paginasDeBlog]
    .map(({ loc, prioridad, frecuencia }) => `
  <url>
    <loc>${SITE_URL}${loc}</loc>
    <changefreq>${frecuencia}</changefreq>
    <priority>${prioridad}</priority>
  </url>`)
    .join('');

  res.set('Content-Type', 'application/xml');
  res.set('Cache-Control', 'public, max-age=3600');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}\n</urlset>`);
});

app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

app.get('/healthz', (req, res) => res.status(200).send('ok'));

app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'), (err) => {
    if (err) res.status(404).send('Pagina no encontrada');
  });
});

const PORT = process.env.PORT || 3000;
let servidor;
store.init()
  .then(() => {
    servidor = app.listen(PORT, () => {
      console.log(`Endulcora escuchando en el puerto ${PORT}`);
    });
    // Si un deploy o reinicio interrumpio una campaña de correo a la mitad,
    // la retoma automaticamente en vez de dejarla congelada para siempre.
    require('./src/campanas').reanudarCampanasPendientes();
    // Secuencia del lead magnet y recordatorio de membresia: revisa cada
    // cierto tiempo a quien le toca un correo (ver src/automatizaciones.js).
    require('./src/automatizaciones').iniciarAutomatizaciones();
  })
  .catch((err) => {
    console.error('No se pudo conectar a la base de datos, el servidor no arranco:', err.message);
    process.exit(1);
  });

// Al apagar el contenedor (ej. redeploy en Railway), espera a que termine de
// guardar en la base de datos antes de salir, para no perder el ultimo cambio.
process.on('SIGTERM', async () => {
  try {
    await store.flush();
  } finally {
    if (servidor) servidor.close(() => process.exit(0));
    else process.exit(0);
  }
});
