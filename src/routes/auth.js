const express = require('express');
const bcrypt = require('bcryptjs');
const store = require('../store');
const { uploadImage, procesarImagenSubida, borrarSiEsSubida } = require('../uploads');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function usuarioPublico(u) {
  return { id: u.id, email: u.email, nombre: u.nombre, telefono: u.telefono || '', fotoPerfilUrl: u.fotoPerfilUrl || '' };
}

function requireCliente(req, res, next) {
  if (req.session && req.session.userId) return next();
  return res.status(401).json({ error: 'Tienes que iniciar sesión.' });
}

router.post('/register', (req, res) => {
  const { email, password, nombre, telefono } = req.body || {};
  if (!email || !EMAIL_RE.test(String(email).trim())) {
    return res.status(400).json({ error: 'Escribe un correo válido.' });
  }
  if (!password || String(password).length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
  }
  if (!nombre || !String(nombre).trim()) {
    return res.status(400).json({ error: 'Escribe tu nombre.' });
  }
  const telefonoDigitos = String(telefono || '').replace(/\D/g, '');
  if (telefonoDigitos.length < 10) {
    return res.status(400).json({ error: 'Escribe un número de teléfono válido (10 dígitos).' });
  }
  if (store.getUserByEmail(email)) {
    return res.status(409).json({ error: 'Ya existe una cuenta con ese correo. Inicia sesión.' });
  }

  const passwordHash = bcrypt.hashSync(String(password), 10);
  const user = store.addUser({ email, passwordHash, nombre: String(nombre).trim(), telefono: telefonoDigitos });
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

// "Mi cuenta" de la app (22 nov 2026): talleres apartados con su saldo,
// eBooks comprados con su enlace de descarga y la membresia con el precio
// de miembro que le queda este mes.
router.get('/mi-cuenta', requireCliente, (req, res) => {
  const user = store.getUserById(req.session.userId);
  if (!user) return res.status(401).json({ error: 'Tienes que iniciar sesión.' });
  const correo = String(user.email || '').toLowerCase();
  const hoy = new Date(Date.now() - 6 * 3600 * 1000).toISOString().slice(0, 10);
  const sesiones = store.getSesionesTaller();
  const talleres = store.getInscripcionesTaller()
    .filter((i) => (i.usuarioId === user.id || (correo && i.correo === correo))
      && i.estadoPago === 'pagado' && String(i.fecha || '') >= hoy)
    .sort((a, b) => (a.fecha < b.fecha ? -1 : 1))
    .map((i) => {
      const s = sesiones.find((x) => x.id === i.sesionTallerId);
      return { taller: i.taller, fecha: i.fecha, sede: i.sede, horario: i.horario,
        saldo: Number(i.saldo) || 0, slug: s ? s.slug : '' };
    });
  const ebooks = [];
  store.getOrdersByUser(user.id, correo).filter((o) => o.estado === 'aprobado' && o.descargaToken).forEach((o) => {
    (o.items || []).filter((it) => it.tipo !== 'taller').forEach((it) => {
      ebooks.push({ titulo: it.titulo, url: `/api/pedidos/${o.id}/ebooks?token=${encodeURIComponent(o.descargaToken)}` });
    });
  });
  const c = store.getContent();
  const activa = user.membresiaEstado === 'activa';
  const limite = parseInt(c.taller_miembro_talleres_mes, 10) || 0;
  const usados = activa ? store.usosDescuentoMiembro(user.id, hoy.slice(0, 7)) : 0;
  res.set('Cache-Control', 'no-store');
  res.json({
    nombre: user.nombre,
    membresia: { activa, precioMiembro: activa ? Number(String(c.taller_precio_miembro || 0).replace(/,/g, '')) || 0 : 0, limite, usados },
    talleres: talleres.slice(0, 10),
    ebooks: ebooks.slice(0, 30),
  });
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

router.post('/foto', requireCliente, uploadImage.single('file'), procesarImagenSubida, (req, res) => {
  const user = store.getUserById(req.session.userId);
  if (!user) return res.status(401).json({ error: 'Tienes que iniciar sesión.' });
  if (!req.file) return res.status(400).json({ error: 'Sube una foto.' });
  const anterior = user.fotoPerfilUrl;
  const actualizado = store.updateUser(user.id, { fotoPerfilUrl: `/uploads/${req.file.filename}` });
  borrarSiEsSubida(anterior);
  res.json({ user: usuarioPublico(actualizado) });
});

router.post('/resenas', requireCliente, uploadImage.single('imagen'), procesarImagenSubida, (req, res) => {
  const user = store.getUserById(req.session.userId);
  if (!user) return res.status(401).json({ error: 'Tienes que iniciar sesión.' });
  const { texto, estrellas } = req.body || {};
  if (!texto || !String(texto).trim()) return res.status(400).json({ error: 'Escribe tu reseña.' });
  if (!estrellas || Number(estrellas) < 1 || Number(estrellas) > 5) {
    return res.status(400).json({ error: 'Elige una calificación de 1 a 5 estrellas.' });
  }
  const item = store.addResena({
    userId: user.id,
    nombreAutor: user.nombre,
    texto,
    estrellas,
    imagen: req.file ? `/uploads/${req.file.filename}` : '',
    imagenNombre: req.file ? req.file.filename : '',
    fotoAutor: user.fotoPerfilUrl || '',
  });
  res.status(201).json(item);
});

module.exports = router;
module.exports.requireCliente = requireCliente;
