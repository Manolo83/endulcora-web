// Permiso de Google Ads en un clic.
//
// El duenio de la cuenta abre un enlace, acepta, y Google regresa al servidor
// con un codigo que se cambia por el permiso permanente. Ese permiso se guarda
// en la base de datos, asi que no hay que copiar ni pegar nada a mano.
//
// Lo usan las dos puertas: el panel HTTP (src/routes/googleAds.js) y la
// herramienta de consola (scripts/google-ads.js), para que el enlace y la
// validacion sean exactamente los mismos por los dos lados.

const crypto = require('crypto');
const { GOOGLE_ADS, SITE_URL } = require('../config');
const api = require('./api');

// Tiene que coincidir letra por letra con el "URI de redireccionamiento
// autorizado" del cliente OAuth en Google Cloud.
const REDIRECT_URI = process.env.GOOGLE_ADS_REDIRECT_URI || `${SITE_URL}/api/google-ads/oauth/callback`;
const SCOPE = 'https://www.googleapis.com/auth/adwords';
const SECRETO_ESTADO = 'googleAdsOauthEstado';
const VIGENCIA_ESTADO_MS = 15 * 60 * 1000;

// Alfabeto sin caracteres que se confundan al teclear (0/O, 1/I/L).
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function claveCorta(largo = 8) {
  const bytes = crypto.randomBytes(largo);
  let salida = '';
  for (const b of bytes) salida += ALFABETO[b % ALFABETO.length];
  return salida;
}

// El store se pide al vuelo: la herramienta de consola puede correr sin base
// de datos para otros comandos, y no queremos que reviente al cargar.
function store() {
  return require('../store');
}

// Enlace que hay que abrir una sola vez, con el "state" ya guardado.
function generarEnlace() {
  if (!GOOGLE_ADS.clientId || !GOOGLE_ADS.clientSecret) {
    throw new Error('Faltan GOOGLE_ADS_CLIENT_ID y GOOGLE_ADS_CLIENT_SECRET (el cliente OAuth de Google Cloud).');
  }

  const estado = crypto.randomBytes(24).toString('hex');
  const clave = claveCorta();

  const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id: GOOGLE_ADS.clientId,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state: estado,
  });

  store().setSecreto(SECRETO_ESTADO, { valor: estado, creadoEn: Date.now(), clave, url });

  // La URL de Google es larguisima y al copiarla de una consola se parte. Este
  // atajo vive en nuestro dominio, se puede teclear a mano y solo redirige.
  const base = REDIRECT_URI.replace('/api/google-ads/oauth/callback', '');
  return {
    url,
    enlaceCorto: `${base}/api/google-ads/oauth/ir/${clave}`,
    redirectUri: REDIRECT_URI,
    vigenciaMinutos: VIGENCIA_ESTADO_MS / 60000,
  };
}

// Busca el enlace de Google que corresponde a un atajo. No gasta el "state":
// eso pasa hasta que Google regresa al callback.
function enlaceDeClave(clave) {
  const guardado = store().getSecreto(SECRETO_ESTADO);
  if (!guardado || !guardado.clave || !clave || guardado.clave !== String(clave).toUpperCase()) return null;
  if (Date.now() - Number(guardado.creadoEn || 0) > VIGENCIA_ESTADO_MS) return null;
  return guardado.url || null;
}

// El "state" es de un solo uso: se gaste bien o mal, se borra.
function revisarEstado(recibido) {
  const guardado = store().getSecreto(SECRETO_ESTADO);
  store().setSecreto(SECRETO_ESTADO, null);

  if (!guardado || !recibido || guardado.valor !== recibido) {
    return { ok: false, motivo: 'invalido' };
  }
  if (Date.now() - Number(guardado.creadoEn || 0) > VIGENCIA_ESTADO_MS) {
    return { ok: false, motivo: 'expirado' };
  }
  return { ok: true };
}

// Cambia el codigo que devolvio Google por el permiso permanente y lo guarda.
async function canjearCodigo(codigo) {
  const respuesta = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: String(codigo),
      client_id: GOOGLE_ADS.clientId,
      client_secret: GOOGLE_ADS.clientSecret,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });
  const datos = await respuesta.json().catch(() => ({}));

  if (!respuesta.ok || !datos.refresh_token) {
    const detalle = datos.error_description || datos.error || `HTTP ${respuesta.status}`;
    throw new Error(`Google no devolvio el permiso permanente: ${detalle}`);
  }

  store().setSecreto(api.SECRETO_REFRESH, datos.refresh_token);
  return true;
}

function permisoGuardado() {
  try {
    return Boolean(store().getSecreto(api.SECRETO_REFRESH));
  } catch {
    return false;
  }
}

function olvidarPermiso() {
  store().setSecreto(api.SECRETO_REFRESH, null);
}

module.exports = {
  REDIRECT_URI,
  SCOPE,
  generarEnlace,
  enlaceDeClave,
  revisarEstado,
  canjearCodigo,
  permisoGuardado,
  olvidarPermiso,
};
