// Cliente minimo de la API de Google Sheets (REST, sin libreria googleapis),
// con una cuenta de servicio: nadie tiene que abrir el navegador ni dar
// permiso a mano, basta con compartirle la hoja de calculo a su correo
// (algo@algo.iam.gserviceaccount.com) como si fuera una persona mas.
//
// Mismo estilo que src/googleAds/api.js: fetch crudo, sin dependencias
// nuevas, "configurado()"/"faltantes()" para avisar que falta en vez de
// tronar feo.

const crypto = require('crypto');
const { GOOGLE_SHEETS } = require('./config');

const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

let tokenEnCache = { valor: '', expiraEn: 0 };

function configurado() {
  return Boolean(GOOGLE_SHEETS.clientEmail && GOOGLE_SHEETS.privateKey && GOOGLE_SHEETS.spreadsheetId);
}

function faltantes() {
  const falta = [];
  if (!GOOGLE_SHEETS.clientEmail) falta.push('GOOGLE_SHEETS_CLIENT_EMAIL');
  if (!GOOGLE_SHEETS.privateKey) falta.push('GOOGLE_SHEETS_PRIVATE_KEY');
  if (!GOOGLE_SHEETS.spreadsheetId) falta.push('GOOGLE_SHEETS_SPREADSHEET_ID');
  return falta;
}

function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Las cuentas de servicio no usan refresh token: el servidor firma su propio
// "boleto" (JWT) con la llave privada y Google lo cambia por un access token
// de una hora. Es el flujo oficial "JWT Bearer" de Google OAuth2.
async function accessToken() {
  const ahora = Date.now();
  if (tokenEnCache.valor && tokenEnCache.expiraEn > ahora + 60_000) return tokenEnCache.valor;

  if (!configurado()) {
    throw new Error(`Faltan credenciales de Google Sheets: ${faltantes().join(', ')}. Ver docs/google-sheets.md.`);
  }

  const iat = Math.floor(ahora / 1000);
  const exp = iat + 3600;
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64url(JSON.stringify({
    iss: GOOGLE_SHEETS.clientEmail,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat,
    exp,
  }));
  const firma = crypto.createSign('RSA-SHA256').update(`${header}.${claim}`).sign(GOOGLE_SHEETS.privateKey);
  const jwt = `${header}.${claim}.${base64url(firma)}`;

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(`Google no acepto la cuenta de servicio (${res.status}): ${JSON.stringify(data)}`);
  }

  tokenEnCache = { valor: data.access_token, expiraEn: ahora + (Number(data.expires_in) || 3600) * 1000 };
  return tokenEnCache.valor;
}

async function llamar(ruta, { method = 'GET', body } = {}) {
  const token = await accessToken();
  const res = await fetch(`${SHEETS_BASE}/${ruta}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const texto = await res.text();
  let data = {};
  try { data = texto ? JSON.parse(texto) : {}; } catch { data = { raw: texto }; }
  if (!res.ok) {
    const mensaje = (data.error && data.error.message) || JSON.stringify(data).slice(0, 500);
    throw new Error(`Google Sheets respondio ${res.status} en ${ruta}: ${mensaje}`);
  }
  return data;
}

// Lee la primera fila (encabezados) de una pestaña — pensado para mostrarla
// en /admin ANTES de que el servidor empiece a escribir filas solo, para
// mapear bien cada columna (nunca se adivina el orden).
async function leerEncabezados(hoja) {
  const rango = `${encodeURIComponent(hoja)}!1:1`;
  const data = await llamar(`${GOOGLE_SHEETS.spreadsheetId}/values/${rango}`);
  return (data.values && data.values[0]) || [];
}

// Lista las pestañas (nombre y si termina en "div", que marca Division segun
// el documento de alcance) — tambien para confirmar en /admin a que pestaña
// le va a escribir cada taller antes de automatizarlo.
async function listarHojas() {
  const data = await llamar(`${GOOGLE_SHEETS.spreadsheetId}?fields=sheets.properties.title`);
  return (data.sheets || []).map((s) => s.properties.title);
}

// Agrega una fila al final de la pestaña indicada. valueInputOption=USER_ENTERED
// para que fechas/numeros se interpreten igual que si alguien los tecleara a
// mano en la hoja (no como texto crudo).
async function agregarFila(hoja, valores) {
  const rango = `${encodeURIComponent(hoja)}!A:Z`;
  return llamar(`${GOOGLE_SHEETS.spreadsheetId}/values/${rango}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
    method: 'POST',
    body: { values: [valores] },
  });
}

module.exports = {
  configurado,
  faltantes,
  accessToken,
  leerEncabezados,
  listarHojas,
  agregarFila,
};
