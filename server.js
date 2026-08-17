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
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
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

app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '30d' }));
app.use('/api/checkout', checkoutRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/asistente', asistenteRoutes);
app.use('/api', apiRoutes);
app.use('/admin', adminRoutes);

// Pagina propia por eBook (ej. /ebooks/velas-comestibles): se sirve la misma
// plantilla para cualquier slug, pero se inyectan las etiquetas de meta/Open
// Graph en el servidor (con los datos reales del producto) para que se vean
// bien las vistas previas al compartir o anunciar el enlace.
const escaparHtml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

app.get('/ebooks/:slug', (req, res) => {
  const producto = store.getProductBySlug(req.params.slug);
  if (!producto || producto.categoria !== 'ebook') {
    return res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
  }
  let html;
  try {
    html = fs.readFileSync(path.join(__dirname, 'public', 'producto.html'), 'utf8');
  } catch (e) {
    return res.status(500).send('No se pudo cargar la pagina del producto.');
  }
  const titulo = producto.titulo || 'eBook';
  const descripcion = (producto.descripcionCorta || producto.subtitulo || 'eBook de Endulcora, Estudio Gastronómico.').slice(0, 300);
  const imagen = producto.imagen
    ? (producto.imagen.startsWith('http') ? producto.imagen : `${SITE_URL}${producto.imagen}`)
    : `${SITE_URL}/og-image.png`;
  const url = `${SITE_URL}/ebooks/${producto.slug}`;
  html = html
    .replace(/__TITULO__/g, escaparHtml(titulo))
    .replace(/__DESCRIPCION__/g, escaparHtml(descripcion))
    .replace(/__IMAGEN__/g, escaparHtml(imagen))
    .replace(/__URL__/g, escaparHtml(url));
  res.send(html);
});

// Secciones del sitio con URL propia (ej. /calendario), ademas de las anclas
// #calendario dentro de la pagina principal. Sirven la misma index.html; el
// script del cliente hace scroll a la seccion segun la ruta.
app.get(
  ['/tienda', '/ebooks', '/anexos', '/recetarios', '/clases-en-vivo', '/calculadora', '/calendario', '/galeria', '/resenas', '/anuncios'],
  (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
);

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
