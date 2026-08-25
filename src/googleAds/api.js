// Cliente minimo de la API de Google Ads (REST, sin librerias extra).
//
// Todo pasa por la cuenta administradora (MCC): las mismas credenciales
// sirven para las cuatro cuentas, y el encabezado login-customer-id le dice a
// Google "entro como el administrador para operar esta cuenta hija".

const { GOOGLE_ADS } = require('../config');

const BASE = 'https://googleads.googleapis.com';

// Google retira cada version de la API mas o menos al anio, asi que en vez de
// fijar una a mano se prueban de la mas nueva a la mas vieja y se usa la
// primera que exista. Una version retirada contesta 404 con una pagina HTML.
// Con GOOGLE_ADS_API_VERSION puesta, se respeta esa y no se prueba nada.
const VERSIONES_CONOCIDAS = ['v23', 'v22', 'v21', 'v20', 'v19', 'v18', 'v17'];

let tokenEnCache = { valor: '', expiraEn: 0 };
let versionEnCache = '';

// El permiso permanente puede venir de dos lados: de una variable de entorno
// (si se pego a mano) o de la base de datos, cuando lo consiguio el propio
// servidor con el flujo de un clic de /api/google-ads/oauth. La variable manda.
function refreshToken() {
  if (GOOGLE_ADS.refreshToken) return GOOGLE_ADS.refreshToken;
  try {
    return require('../store').getSecreto(SECRETO_REFRESH) || '';
  } catch {
    // Sin base de datos (por ejemplo al correr la herramienta de consola
    // fuera del servidor) solo queda la variable de entorno.
    return '';
  }
}

const SECRETO_REFRESH = 'googleAdsRefreshToken';

function configurado() {
  return Boolean(
    GOOGLE_ADS.clientId &&
    GOOGLE_ADS.clientSecret &&
    refreshToken() &&
    GOOGLE_ADS.developerToken
  );
}

function faltantes() {
  const falta = [];
  if (!GOOGLE_ADS.clientId) falta.push('GOOGLE_ADS_CLIENT_ID');
  if (!GOOGLE_ADS.clientSecret) falta.push('GOOGLE_ADS_CLIENT_SECRET');
  if (!refreshToken()) falta.push('GOOGLE_ADS_REFRESH_TOKEN (o el permiso de un clic en /api/google-ads/oauth)');
  if (!GOOGLE_ADS.developerToken) falta.push('GOOGLE_ADS_DEVELOPER_TOKEN');
  if (!GOOGLE_ADS.managerId) falta.push('GOOGLE_ADS_MANAGER_ID');
  return falta;
}

// Cambia el refresh token (que no caduca) por un access token de una hora.
// Se guarda en memoria para no pedir uno nuevo en cada llamada.
async function accessToken() {
  const ahora = Date.now();
  if (tokenEnCache.valor && tokenEnCache.expiraEn > ahora + 60_000) return tokenEnCache.valor;

  if (!configurado()) {
    throw new Error(`Faltan credenciales de Google Ads: ${faltantes().join(', ')}. Ver docs/google-ads.md.`);
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_ADS.clientId,
      client_secret: GOOGLE_ADS.clientSecret,
      refresh_token: refreshToken(),
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(`Google no acepto el refresh token (${res.status}): ${JSON.stringify(data)}`);
  }

  tokenEnCache = {
    valor: data.access_token,
    expiraEn: ahora + (Number(data.expires_in) || 3600) * 1000,
  };
  return tokenEnCache.valor;
}

async function encabezados(loginCustomerId) {
  const token = await accessToken();
  const login = String(loginCustomerId || GOOGLE_ADS.managerId || '').replace(/\D/g, '');

  const headers = {
    Authorization: `Bearer ${token}`,
    'developer-token': GOOGLE_ADS.developerToken,
    'Content-Type': 'application/json',
  };
  if (login) headers['login-customer-id'] = login;
  return headers;
}

// Version de la API que de verdad esta viva. Se averigua una sola vez por
// proceso preguntando por la lista de cuentas accesibles: cualquier respuesta
// que no sea 404 significa que esa version existe (un 401 o un 403 tambien
// sirven de prueba, porque para contestarlos hubo que reconocer la ruta).
async function versionApi() {
  if (GOOGLE_ADS.apiVersion) return GOOGLE_ADS.apiVersion;
  if (versionEnCache) return versionEnCache;

  const headers = await encabezados();
  const intentos = [];
  for (const version of VERSIONES_CONOCIDAS) {
    const res = await fetch(`${BASE}/${version}/customers:listAccessibleCustomers`, { method: 'GET', headers });
    if (res.status !== 404) {
      versionEnCache = version;
      console.log(`[google-ads] Usando la version ${version} de la API.`);
      return version;
    }
    intentos.push(version);
  }
  throw new Error(`Ninguna version de la API respondio (probe ${intentos.join(', ')}). Fija GOOGLE_ADS_API_VERSION con la que aparezca en la documentacion de Google.`);
}

// Llamada cruda a la API. `ruta` va sin la version: por ejemplo
// "customers/1234567890/googleAds:search".
async function llamar(ruta, { method = 'POST', body, loginCustomerId } = {}) {
  const headers = await encabezados(loginCustomerId);
  const version = await versionApi();

  const res = await fetch(`${BASE}/${version}/${ruta}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const texto = await res.text();
  let data = {};
  try {
    data = texto ? JSON.parse(texto) : {};
  } catch {
    data = { raw: texto };
  }

  if (!res.ok) {
    throw new Error(`Google Ads respondio ${res.status} en ${ruta}: ${resumirError(data)}`);
  }
  return data;
}

// Los errores de Google traen mucho ruido; deja a la vista el mensaje util.
function resumirError(data) {
  const error = data && data.error;
  if (!error) return JSON.stringify(data).slice(0, 800);
  const detalles = (error.details || [])
    .flatMap((d) => d.errors || [])
    .map((e) => e.message)
    .filter(Boolean);
  const partes = [error.message, ...detalles].filter(Boolean);
  return partes.length ? partes.join(' | ') : JSON.stringify(error).slice(0, 800);
}

// Consulta GAQL (el "SQL" de Google Ads). Devuelve todas las filas, paginando.
// El tamanio de pagina no se manda: desde v23 Google lo rechaza y siempre
// devuelve paginas de 10,000 filas.
async function buscar(customerId, query) {
  const cuenta = String(customerId || '').replace(/\D/g, '');
  if (!cuenta) throw new Error('Falta el ID de la cuenta de Google Ads para la consulta.');

  const filas = [];
  let pageToken;
  do {
    const data = await llamar(`customers/${cuenta}/googleAds:search`, {
      body: { query, ...(pageToken ? { pageToken } : {}) },
    });
    filas.push(...(data.results || []));
    pageToken = data.nextPageToken;
  } while (pageToken);

  return filas;
}

module.exports = {
  configurado,
  faltantes,
  accessToken,
  llamar,
  buscar,
  resumirError,
  refreshToken,
  versionApi,
  VERSIONES_CONOCIDAS,
  SECRETO_REFRESH,
  BASE,
};
