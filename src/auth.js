const bcrypt = require('bcryptjs');

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ error: 'No autorizado' });
}

// Solo lectura para reportes (p. ej. Claude): la variable LECTURA_KEY en
// Railway abre unicamente las consultas GET marcadas con esta funcion,
// con el header X-Lectura-Key. Nunca permite cambiar datos.
function requireAdminOLectura(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  const clave = process.env.LECTURA_KEY;
  const enviada = req.get('X-Lectura-Key') || '';
  if (req.method === 'GET' && clave && clave.length >= 16 && enviada.length === clave.length
    && require('crypto').timingSafeEqual(Buffer.from(enviada), Buffer.from(clave))) return next();
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

module.exports = { requireAdmin, requireAdminOLectura, checkPassword };
