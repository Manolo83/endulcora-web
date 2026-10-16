const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(DATA_DIR, 'uploads');
const SITE_URL = (process.env.SITE_URL || 'https://www.endulcora.com').replace(/\/$/, '');

const META_PIXEL_ID = process.env.META_PIXEL_ID || '';
const META_CAPI_TOKEN = process.env.META_CAPI_TOKEN || '';
const META_CAPI_TEST_CODE = process.env.META_CAPI_TEST_CODE || '';

// Google Ads. Las credenciales (cliente OAuth, refresh token y token de
// desarrollador) son UNAS SOLAS para los cuatro negocios: cuelgan de la cuenta
// administradora (MCC), y esa cuenta es la que da permiso sobre cada cuenta
// individual. Ver docs/google-ads.md para conseguir cada dato.
const GOOGLE_ADS = {
  clientId: process.env.GOOGLE_ADS_CLIENT_ID || '',
  clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET || '',
  refreshToken: process.env.GOOGLE_ADS_REFRESH_TOKEN || '',
  developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '',
  // ID de la cuenta administradora (MCC), 10 digitos sin guiones. Viene de
  // fabrica con la nuestra (894-945-9356), igual que los IDs de las cuatro
  // cuentas en src/googleAds/negocios.js: no es un secreto, es el numero que
  // se ve en la interfaz. La variable de entorno, si existe, manda.
  managerId: String(process.env.GOOGLE_ADS_MANAGER_ID || '8949459356').replace(/\D/g, ''),
  // Vacia = el cliente averigua sola cual version esta viva (ver
  // src/googleAds/api.js). Solo se fija a mano para clavar una en concreto.
  apiVersion: process.env.GOOGLE_ADS_API_VERSION || '',
  // Etiqueta de Google (AW-XXXXXXXXXX) que carga el sitio de Endulcora.
  medicionId: process.env.GOOGLE_ADS_ID || '',
  // Etiqueta completa de la conversion de compra para el navegador:
  // "AW-XXXXXXXXXX/AbC-D_efGhIjKl".
  conversionCompra: process.env.GOOGLE_ADS_CONVERSION_COMPRA || '',
  // ID numerico de esa misma accion de conversion, para subirla desde el
  // servidor (respaldo por si el navegador bloquea la etiqueta).
  conversionCompraId: String(process.env.GOOGLE_ADS_CONVERSION_COMPRA_ID || '').replace(/\D/g, ''),
};

// Google Sheets (cuenta de servicio): para que el servidor agregue filas
// solo, sin que nadie tenga que abrir el navegador. Ver docs/google-sheets.md
// para crear la cuenta de servicio y compartirle la hoja "Inscritos 2026".
const GOOGLE_SHEETS = {
  clientEmail: process.env.GOOGLE_SHEETS_CLIENT_EMAIL || '',
  // La llave viene de Google con saltos de linea reales dentro de un JSON;
  // al pegarla como variable de entorno esos saltos casi siempre llegan como
  // "\n" literal (texto, no salto real) — por eso se reemplazan aqui.
  privateKey: (process.env.GOOGLE_SHEETS_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID || '1-hL_6N2ix8J-peu-3GSM7EDhZu5DN8xFJPQP7fBMxJg',
  // El calendario fisico (un Excel en Drive, con un bloque por sede/mes) que
  // se lee solo todos los dias para dar de alta los talleres nuevos — ver
  // src/syncCalendarioTalleres.js. Misma cuenta de servicio, pero hay que
  // compartirle TAMBIEN este archivo (no solo "Inscritos 2026").
  calendarioFisicoId: process.env.GOOGLE_SHEETS_CALENDARIO_ID || '1-PgGk3Nk7K1JT5xGjvoYePnoz5ObbmUf',
};

// Correo(s) del equipo de Endulcora que deben enterarse de cada inscripcion
// nueva a un taller sin tener que estar revisando /admin. Varios correos se
// separan por coma. Vacia = no se manda ningun aviso (no es un requisito).
const EQUIPO_NOTIFICACIONES_EMAIL = String(process.env.EQUIPO_NOTIFICACIONES_EMAIL || '')
  .split(',')
  .map((e) => e.trim())
  .filter(Boolean);

module.exports = {
  DATA_DIR,
  UPLOAD_DIR,
  SITE_URL,
  META_PIXEL_ID,
  META_CAPI_TOKEN,
  META_CAPI_TEST_CODE,
  GOOGLE_ADS,
  GOOGLE_SHEETS,
  EQUIPO_NOTIFICACIONES_EMAIL,
};
