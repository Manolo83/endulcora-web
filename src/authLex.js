// Acceso al portal de Lex: un codigo corto, no una cuenta con usuario. Es
// la unica persona que lo usa, siempre desde su misma computadora — la
// sesion dura varios meses (ver cookieSession en server.js) para que no
// tenga que volver a escribirlo salvo que entre desde otro equipo.
function requireLex(req, res, next) {
  if (req.session && req.session.isLex) return next();
  return res.status(401).json({ error: 'No autorizado' });
}

function checkLexCode(codigo) {
  if (typeof codigo !== 'string' || !codigo) return false;
  const esperado = process.env.LEX_CODE;
  if (!esperado) return false;
  // Sin distinguir mayusculas/minusculas: que a Lex le funcione aunque lo
  // escriba distinto a como quedo guardado en Railway.
  return codigo.trim().toLowerCase() === esperado.trim().toLowerCase();
}

module.exports = { requireLex, checkLexCode };
