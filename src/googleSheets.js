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
async function leerEncabezados(hoja, spreadsheetId = GOOGLE_SHEETS.spreadsheetId) {
  const rango = `${encodeURIComponent(hoja)}!1:1`;
  const data = await llamar(`${spreadsheetId}/values/${rango}`);
  return (data.values && data.values[0]) || [];
}

// Lista las pestañas de cualquiera de los dos Sheets que usa el sitio
// (Inscritos 2026 por defecto, o el calendario fisico pasando su ID).
async function listarHojas(spreadsheetId = GOOGLE_SHEETS.spreadsheetId) {
  const data = await llamar(`${spreadsheetId}?fields=sheets.properties.title`);
  return (data.sheets || []).map((s) => s.properties.title);
}

// Busca entre las pestañas que YA EXISTEN una que coincida con el nombre
// calculado sin importar mayusculas/minusculas (ej. el titulo del taller
// es "Tacos de canasta" pero la pestaña real se llama "TACOS DE CANASTA" o
// "tacos de canasta") — para no crear una pestaña nueva duplicada solo por
// una diferencia de mayusculas. Si no encuentra ninguna, regresa el nombre
// calculado tal cual (agregarFila la crea sola si tampoco existe asi).
async function resolverNombreHoja(nombreCalculado, spreadsheetId = GOOGLE_SHEETS.spreadsheetId) {
  const hojas = await listarHojas(spreadsheetId);
  const normal = (s) => String(s || '').trim().toLowerCase();
  const encontrada = hojas.find((h) => normal(h) === normal(nombreCalculado));
  return encontrada || nombreCalculado;
}

// Encabezados reales de "Inscritos 2026" (ver docs/google-sheets.md) — se
// usan para crear sola la pestaña de un taller nuevo la primera vez que
// alguien se inscribe, en vez de fallar silenciosamente porque la pestaña
// todavia no existe (el equipo ya no tiene que acordarse de crearla a mano
// cada vez que se da de alta un taller).
const ENCABEZADOS_INSCRITOS = [
  'NOMBRE', 'ANTICIPO', 'DEBE', 'DIA/HORA', 'RECONOCIMIENTO', 'Recetario',
  'MATERIAL', 'MEMBRESIA', 'BETTERWARE', 'APARTADO', 'PAGO', 'ESTATUS', 'FORMA DE PAGO',
];

async function crearHoja(hoja, spreadsheetId, encabezados) {
  await llamar(`${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    body: { requests: [{ addSheet: { properties: { title: hoja } } }] },
  });
  if (encabezados && encabezados.length) {
    const rango = `${encodeURIComponent(hoja)}!A1`;
    await llamar(`${spreadsheetId}/values/${rango}?valueInputOption=USER_ENTERED`, {
      method: 'PUT',
      body: { values: [encabezados] },
    });
  }
}

// Agrega una fila al final de la pestaña indicada, calculando a mano en
// que fila escribir (en vez de usar values:append) — las pestañas reales
// de un equipo editadas a mano suelen tener huecos (filas en blanco entre
// bloques de inscritos), y el "pegado inteligente" de values:append sobre
// un rango abierto (A:Z) a veces confunde esos huecos y escribe la fila
// nueva recorrida varias columnas a la derecha (ej. el nombre cae en la
// columna de APARTADO en vez de en NOMBRE). Contar cuantas filas tiene ya
// la columna A y escribir con values:update exactamente ahi es mas lento
// (una lectura extra) pero no tiene esa ambiguedad.
//
// valueInputOption=USER_ENTERED para que fechas/numeros se interpreten
// igual que si alguien los tecleara a mano en la hoja (no como texto
// crudo). Si la pestaña todavia no existe (un taller nuevo que nunca tuvo
// inscripciones), se crea sola con los encabezados de "Inscritos 2026" y
// se reintenta una vez.
function columnaLetra(indiceDesdeCero) {
  // 0 -> A, 1 -> B ... 25 -> Z (de sobra para las 13 columnas de Inscritos).
  return String.fromCharCode('A'.charCodeAt(0) + indiceDesdeCero);
}

async function agregarFila(hoja, valores, spreadsheetId = GOOGLE_SHEETS.spreadsheetId, encabezados = ENCABEZADOS_INSCRITOS) {
  const columnaFinal = columnaLetra(valores.length - 1);
  const intentar = async () => {
    const columnaA = await llamar(`${spreadsheetId}/values/${encodeURIComponent(hoja)}!A:A`);
    const filaDestino = (columnaA.values || []).length + 1;
    const rangoDestino = `${encodeURIComponent(hoja)}!A${filaDestino}:${columnaFinal}${filaDestino}`;
    return llamar(`${spreadsheetId}/values/${rangoDestino}?valueInputOption=USER_ENTERED`, {
      method: 'PUT',
      body: { values: [valores] },
    });
  };
  try {
    return await intentar();
  } catch (e) {
    if (!/unable to parse range/i.test(e.message)) throw e;
    await crearHoja(hoja, spreadsheetId, encabezados);
    return intentar();
  }
}

// Lee todas las celdas (como texto formateado, igual que se ve en pantalla)
// de una pestaña completa — para el calendario fisico, que no es una tabla
// de columnas fijas sino una cuadricula libre (ver
// src/syncCalendarioTalleres.js, que es quien la interpreta).
async function leerCuadricula(hoja, spreadsheetId) {
  const rango = `${encodeURIComponent(hoja)}`;
  const data = await llamar(`${spreadsheetId}/values/${rango}?valueRenderOption=FORMATTED_VALUE`);
  return data.values || [];
}

module.exports = {
  configurado,
  faltantes,
  accessToken,
  leerEncabezados,
  listarHojas,
  resolverNombreHoja,
  agregarFila,
  leerCuadricula,
  ENCABEZADOS_INSCRITOS,
};
