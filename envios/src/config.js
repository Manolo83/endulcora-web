const path = require('path');

// Carpeta donde viven los datos y los archivos que se suben. En Railway conviene
// apuntarla a un volumen para que no se pierda al reiniciar el servidor.
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'datos'));
const UPLOAD_DIR = path.join(DATA_DIR, 'subidas');
const CATALOGO_DIR = path.join(__dirname, '..', 'catalogos');

// Un solo acceso compartido: lo usan Lex y Alek con la misma contrasena.
const APP_PASSWORD = process.env.APP_PASSWORD || '';

module.exports = { DATA_DIR, UPLOAD_DIR, CATALOGO_DIR, APP_PASSWORD };
