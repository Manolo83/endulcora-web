require('dotenv').config();

const path = require('path');
const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const cookieSession = require('cookie-session');
const rateLimit = require('express-rate-limit');

const { UPLOAD_DIR, MARCA } = require('./src/config');
const store = require('./src/store');
const apiRoutes = require('./src/routes/api');
const adminRoutes = require('./src/routes/admin');
const checkoutRoutes = require('./src/routes/checkout');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();
// Railway va detras de un proxy: sin esto, `req.ip` seria siempre la IP del
// proxy y todos los visitantes compartirian el mismo cupo de rate limit, ademas
// de que Meta recibiria la IP equivocada en cada evento.
app.set('trust proxy', 1);

// Tailwind por CDN y los scripts en linea de la landing necesitan CSP relajado.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
// Las cookies `_fbp` y `_fbc` que pone el Pixel se leen aqui para mandarlas a
// la Conversions API; sin cookie-parser no habria como emparejar los eventos
// del servidor con el clic del anuncio.
app.use(cookieParser());

app.use(
  cookieSession({
    name: 'levent_session',
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

// El formulario de la landing es el unico endpoint publico que escribe en la
// base de datos, asi que es el que hay que proteger de envios automatizados.
const leadsLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Ya recibimos tus datos. Si necesitas algo mas, escribenos por WhatsApp.' },
});
app.use('/api/leads', leadsLimiter);

// Este endpoint reenvia eventos a Meta. Un limite alto pero real evita que
// alguien infle las conversiones de la campana a base de peticiones repetidas.
const eventosLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados eventos seguidos.' },
});
app.use('/api/eventos', eventosLimiter);

const checkoutLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de compra. Intenta de nuevo en unos minutos.' },
});
app.use('/api/checkout/preference', checkoutLimiter);

app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '30d' }));
app.use('/api/checkout', checkoutRoutes);
app.use('/api', apiRoutes);
app.use('/admin', adminRoutes);
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

app.get('/healthz', (req, res) => res.status(200).send('ok'));

app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'), (err) => {
    if (err) res.status(404).send('Pagina no encontrada');
  });
});

const PORT = process.env.PORT || 3000;
let servidor;
store
  .init()
  .then(() => {
    servidor = app.listen(PORT, () => {
      console.log(`${MARCA} escuchando en el puerto ${PORT}`);
      if (!process.env.META_PIXEL_ID) {
        console.warn('[meta] Falta META_PIXEL_ID: la landing funciona pero la campana no se esta midiendo.');
      } else if (!process.env.META_ACCESS_TOKEN) {
        console.warn('[meta] Falta META_ACCESS_TOKEN: solo mide el Pixel del navegador, sin Conversions API.');
      }
    });
  })
  .catch((err) => {
    console.error('No se pudo conectar a la base de datos, el servidor no arranco:', err.message);
    process.exit(1);
  });

// Al apagar el contenedor (por ejemplo en un redeploy de Railway), espera a que
// termine de guardar en la base de datos antes de salir, para no perder el
// ultimo lead capturado.
process.on('SIGTERM', async () => {
  try {
    await store.flush();
  } finally {
    if (servidor) servidor.close(() => process.exit(0));
    else process.exit(0);
  }
});
