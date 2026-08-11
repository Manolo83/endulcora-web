require('dotenv').config();

const path = require('path');
const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cookieSession = require('cookie-session');
const rateLimit = require('express-rate-limit');

const { UPLOAD_DIR } = require('./src/config');
const store = require('./src/store');
const apiRoutes = require('./src/routes/api');
const adminRoutes = require('./src/routes/admin');
const checkoutRoutes = require('./src/routes/checkout');
const authRoutes = require('./src/routes/auth');
const asistenteRoutes = require('./src/routes/asistente');
const metaRoutes = require('./src/routes/meta');
const legalRoutes = require('./src/routes/legal');
const botAlmacen = require('./src/bot/almacen');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

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
app.use(
  express.json({
    limit: '2mb',
    // Meta firma el cuerpo tal cual lo manda, byte por byte. Hay que guardarlo
    // antes de parsearlo para poder verificar la firma en /api/meta/webhook.
    verify: (req, res, buf) => {
      if (req.originalUrl.startsWith('/api/meta/')) req.rawBody = buf;
    },
  })
);
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

// El webhook de Meta trae su propio limite: reintenta agresivamente y no debe
// competir con el resto de la API por el mismo cubo.
const metaLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/meta', metaLimiter);

app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '30d' }));
app.use('/api/meta', metaRoutes);
app.use('/api/checkout', checkoutRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/asistente', asistenteRoutes);
app.use('/api', apiRoutes);
app.use('/admin', adminRoutes);
app.use(legalRoutes);
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
  .then(() => botAlmacen.init())
  .then(() => {
    servidor = app.listen(PORT, () => {
      console.log(`Endulcora escuchando en el puerto ${PORT}`);
    });
    // Los ids de mensajes de Meta solo sirven para no procesar dos veces el
    // mismo webhook; a los pocos dias son basura.
    botAlmacen.limpiarEventosViejos().catch(() => {});
    setInterval(() => botAlmacen.limpiarEventosViejos().catch(() => {}), 24 * 60 * 60 * 1000).unref();
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
