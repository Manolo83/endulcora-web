require('dotenv').config();

const path = require('path');
const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cookieSession = require('cookie-session');
const rateLimit = require('express-rate-limit');

const { UPLOAD_DIR } = require('./src/config');
const apiRoutes = require('./src/routes/api');
const adminRoutes = require('./src/routes/admin');
const checkoutRoutes = require('./src/routes/checkout');
const authRoutes = require('./src/routes/auth');

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

app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '30d' }));
app.use('/api/checkout', checkoutRoutes);
app.use('/api/auth', authRoutes);
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
app.listen(PORT, () => {
  console.log(`Endulcora escuchando en el puerto ${PORT}`);
});
