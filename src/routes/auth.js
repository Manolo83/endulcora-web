const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const store = require('../store');
const { enviarCorreoRecuperacion } = require('../email');
const { SITE_URL } = require('../config');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function usuarioPublico(u) {
  return { id: u.id, email: u.email, nombre: u.nombre };
}

function requireCliente(req, res, next) {
  if (req.session && req.session.userId) return next();
  return res.status(401).json({ error: 'Tienes que iniciar sesión.' });
}

router.post('/register', (req, res) => {
  const { email, password, nombre } = req.body || {};
  if (!email || !EMAIL_RE.test(String(email).trim())) {
    return res.status(400).json({ error: 'Escribe un correo válido.' });
  }
  if (!password || String(password).length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
  }
  if (!nombre || !String(nombre).trim()) {
    return res.status(400).json({ error: 'Escribe tu nombre.' });
  }
  if (store.getUserByEmail(email)) {
    return res.status(409).json({ error: 'Ya existe una cuenta con ese correo. Inicia sesión.' });
  }

  const passwordHash = bcrypt.hashSync(String(password), 10);
  const user = store.addUser({ email, passwordHash, nombre: String(nombre).trim() });
  req.session.userId = user.id;
  res.status(201).json({ user: usuarioPublico(user) });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  const user = store.getUserByEmail(email);
  if (!user || !bcrypt.compareSync(String(password || ''), user.passwordHash)) {
    return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
  }
  req.session.userId = user.id;
  res.json({ user: usuarioPublico(user) });
});

router.post('/logout', (req, res) => {
  if (req.session) req.session.userId = null;
  res.json({ ok: true });
});

router.get('/session', (req, res) => {
  const user = req.session && req.session.userId ? store.getUserById(req.session.userId) : null;
  res.json({ isLoggedIn: !!user, user: user ? usuarioPublico(user) : null });
});

router.patch('/me', requireCliente, (req, res) => {
  const user = store.getUserById(req.session.userId);
  if (!user) return res.status(401).json({ error: 'Tienes que iniciar sesión.' });

  const { nombre, password, passwordActual } = req.body || {};
  const patch = {};
  if (typeof nombre === 'string' && nombre.trim()) patch.nombre = nombre.trim();

  if (password) {
    if (!passwordActual || !bcrypt.compareSync(String(passwordActual), user.passwordHash)) {
      return res.status(401).json({ error: 'Tu contraseña actual no es correcta.' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres.' });
    }
    patch.passwordHash = bcrypt.hashSync(String(password), 10);
  }

  const actualizado = store.updateUser(user.id, patch);
  res.json({ user: usuarioPublico(actualizado) });
});

router.get('/orders', requireCliente, (req, res) => {
  const user = store.getUserById(req.session.userId);
  if (!user) return res.status(401).json({ error: 'Tienes que iniciar sesión.' });
  res.json(store.getOrdersByUser(user.id, user.email));
});

router.post('/forgot-password', (req, res) => {
  const { email } = req.body || {};
  const mensaje = { ok: true, message: 'Si ese correo tiene una cuenta, te enviamos un enlace para restablecer tu contraseña.' };

  const user = store.getUserByEmail(email);
  if (!user) return res.json(mensaje);

  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  store.updateUser(user.id, {
    resetTokenHash: tokenHash,
    resetTokenExpires: Date.now() + 60 * 60 * 1000,
  });

  const resetUrl = `${SITE_URL}/?resetToken=${token}`;
  enviarCorreoRecuperacion({ to: user.email, resetUrl }).catch(() => {
    // Si el correo no se pudo enviar (ej. servicio no configurado), no lo revelamos al cliente.
  });

  res.json(mensaje);
});

router.post('/reset-password', (req, res) => {
  const { token, password } = req.body || {};
  if (!token || !password) return res.status(400).json({ error: 'Faltan datos.' });
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
  }

  const tokenHash = crypto.createHash('sha256').update(String(token)).digest('hex');
  const user = store.getUserByResetToken(tokenHash);
  if (!user) return res.status(400).json({ error: 'El enlace no es válido o ya expiró. Solicita uno nuevo.' });

  const actualizado = store.updateUser(user.id, {
    passwordHash: bcrypt.hashSync(String(password), 10),
    resetTokenHash: null,
    resetTokenExpires: null,
  });
  req.session.userId = actualizado.id;
  res.json({ user: usuarioPublico(actualizado) });
});

module.exports = router;
