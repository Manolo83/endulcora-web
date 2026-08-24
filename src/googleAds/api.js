// Cliente minimo de la API de Google Ads (REST, sin librerias extra).
//
// Todo pasa por la cuenta administradora (MCC): las mismas credenciales
// sirven para las cuatro cuentas, y el encabezado login-customer-id le dice a
// Google "entro como el administrador para operar esta cuenta hija".

const { GOOGLE_ADS } = require('../config');

const BASE = 'https://googleads.googleapis.com';

let tokenEnCache = { valor: '', expiraEn: 0 };

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

// Llamada cruda a la API. `ruta` va sin la version: por ejemplo
// "customers/1234567890/googleAds:search".
async function llamar(ruta, { method = 'POST', body, loginCustomerId } = {}) {
  const token = await accessToken();
  const login = String(loginCustomerId || GOOGLE_ADS.managerId || '').replace(/\D/g, '');

  const headers = {
    Authorization: `Bearer ${token}`,
    'developer-token': GOOGLE_ADS.developerToken,
    'Content-Type': 'application/json',
  };
  if (login) headers['login-customer-id'] = login;

  const res = await fetch(`${BASE}/${GOOGLE_ADS.apiVersion}/${ruta}`, {
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
async function buscar(customerId, query, { pageSize = 1000 } = {}) {
  const cuenta = String(customerId || '').replace(/\D/g, '');
  if (!cuenta) throw new Error('Falta el ID de la cuenta de Google Ads para la consulta.');

  const filas = [];
  let pageToken;
  do {
    const data = await llamar(`customers/${cuenta}/googleAds:search`, {
      body: { query, pageSize, ...(pageToken ? { pageToken } : {}) },
    });
    filas.push(...(data.results || []));
    pageToken = data.nextPageToken;
  } while (pageToken);

  return filas;
}

module.exports = { configurado, faltantes, accessToken, llamar, buscar, resumirError, refreshToken, SECRETO_REFRESH, BASE };
