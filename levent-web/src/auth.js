const bcrypt = require('bcryptjs');

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ error: 'No autorizado' });
}

function checkPassword(password) {
  if (typeof password !== 'string' || !password) return false;

  const hash = process.env.ADMIN_PASSWORD_HASH;
  if (hash) return bcrypt.compareSync(password, hash);

  const plain = process.env.ADMIN_PASSWORD;
  if (plain) return password === plain;

  return false;
}

module.exports = { requireAdmin, checkPassword };
