// ---------------------------------------------------------------------------
// Meta Pixel + Conversions API (CAPI)
//
// Meta mide una campana de dos maneras a la vez:
//
//   1. El Pixel, desde el navegador (`fbq(...)`). Se pierde cuando el visitante
//      trae bloqueador de anuncios, iOS con seguimiento limitado o cierra la
//      pestana antes de que cargue el script. Hoy se pierde entre 20% y 40%.
//   2. La Conversions API, desde este servidor. No la bloquea nadie porque el
//      evento sale de aqui, no del navegador.
//
// Se mandan LOS DOS por cada conversion, con el MISMO `event_id`. Meta ve el
// par, lo deduplica y se queda con uno solo: asi no se cuentan dobles y no se
// pierden los que el navegador no alcanzo a mandar. Ese `event_id` compartido
// es lo unico que hace que la deduplicacion funcione — si se rompe, la campana
// reporta el doble de conversiones de las reales y el algoritmo optimiza mal.
//
// Los datos personales (correo, telefono, nombre) NUNCA salen en claro: van
// hasheados con SHA-256 sobre el valor normalizado, como exige Meta.
// ---------------------------------------------------------------------------

const crypto = require('crypto');

const API_VERSION = 'v21.0';
const TIMEOUT_MS = 8000;

// Eventos que el navegador puede pedirle al servidor que replique. Es una lista
// blanca a proposito: sin ella cualquiera podria inflar las conversiones de la
// campana llamando al endpoint publico con el nombre de evento que se le antoje.
const EVENTOS_PERMITIDOS = new Set([
  'PageView',
  'ViewContent',
  'Lead',
  'Contact',
  'CompleteRegistration',
  'InitiateCheckout',
  'AddToCart',
  'Search',
  'Schedule',
  'SubmitApplication',
]);

function pixelId() {
  return process.env.META_PIXEL_ID || '';
}

function accessToken() {
  return process.env.META_ACCESS_TOKEN || '';
}

function estaConfigurado() {
  return !!(pixelId() && accessToken());
}

// ---- Normalizacion + hashing -----------------------------------------------
// Meta exige un formato exacto ANTES de hashear. Un correo con mayusculas o un
// telefono con guiones genera un hash distinto al que Meta tiene guardado, y el
// evento deja de emparejarse con una persona real: la conversion se registra
// pero no sirve para optimizar ni para publicos similares.

function sha256(valor) {
  return crypto.createHash('sha256').update(valor, 'utf8').digest('hex');
}

function hashEmail(email) {
  const limpio = String(email || '').trim().toLowerCase();
  if (!limpio || !limpio.includes('@')) return null;
  return sha256(limpio);
}

// Meta quiere el telefono en formato internacional, solo digitos y sin el `+`.
// Los numeros mexicanos se capturan casi siempre a 10 digitos, asi que se les
// antepone la lada del pais (52) automaticamente.
function hashTelefono(telefono, ladaPais = '52') {
  let digitos = String(telefono || '').replace(/\D/g, '');
  if (!digitos) return null;
  if (digitos.length === 10) digitos = ladaPais + digitos;
  // Un 00 o un 1 al inicio son prefijos de marcacion, no parte del numero.
  else if (digitos.startsWith('00')) digitos = digitos.slice(2);
  if (digitos.length < 8) return null;
  return sha256(digitos);
}

function hashNombre(nombre) {
  const limpio = String(nombre || '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\s]/gu, '')
    .replace(/\s+/g, ' ');
  if (!limpio) return null;
  return sha256(limpio);
}

function hashSimple(valor) {
  const limpio = String(valor || '').trim().toLowerCase().replace(/\s+/g, '');
  return limpio ? sha256(limpio) : null;
}

// ---- Identificadores de clic (fbp / fbc) ------------------------------------
// `_fbp` lo pone el Pixel en el navegador; `_fbc` guarda el clic del anuncio.
// Son las senales de emparejamiento mas fuertes que existen despues del correo:
// sin ellas, Meta no sabe que anuncio genero la conversion.

// Cuando alguien llega desde un anuncio, la URL trae `?fbclid=...`. Si el Pixel
// todavia no ha corrido, la cookie `_fbc` aun no existe, asi que se arma aqui
// con el formato exacto que Meta espera: fb.1.<milisegundos>.<fbclid>
function construirFbc(fbclid, timestampMs) {
  if (!fbclid) return null;
  return `fb.1.${timestampMs || Date.now()}.${fbclid}`;
}

function datosDelNavegador(req, extra = {}) {
  const cookies = req.cookies || {};
  const fbclid = extra.fbclid || req.query?.fbclid || null;

  return {
    ip: (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || null,
    userAgent: req.headers['user-agent'] || null,
    fbp: extra.fbp || cookies._fbp || null,
    fbc: extra.fbc || cookies._fbc || construirFbc(fbclid, extra.fbclidTimestamp),
  };
}

// ---- Envio del evento -------------------------------------------------------

function construirUserData(persona = {}, navegador = {}) {
  const userData = {};

  const em = hashEmail(persona.email);
  if (em) userData.em = [em];

  const ph = hashTelefono(persona.telefono);
  if (ph) userData.ph = [ph];

  const fn = hashNombre(persona.nombre);
  if (fn) userData.fn = [fn];

  const ln = hashNombre(persona.apellido);
  if (ln) userData.ln = [ln];

  const ct = hashSimple(persona.ciudad);
  if (ct) userData.ct = [ct];

  const st = hashSimple(persona.estado);
  if (st) userData.st = [st];

  if (persona.externalId) userData.external_id = [sha256(String(persona.externalId))];

  // Estos cuatro van en claro a proposito: Meta los usa para emparejar y no son
  // datos personales identificables por si solos.
  if (navegador.ip) userData.client_ip_address = navegador.ip;
  if (navegador.userAgent) userData.client_user_agent = navegador.userAgent;
  if (navegador.fbp) userData.fbp = navegador.fbp;
  if (navegador.fbc) userData.fbc = navegador.fbc;

  return userData;
}

/**
 * Manda un evento a la Conversions API.
 *
 * Nunca lanza: si Meta esta caido o el token vencio, la campana pierde ese
 * evento pero el visitante no ve un error ni deja de recibir su respuesta.
 * El resultado se guarda en el store para poder revisarlo desde /admin.
 *
 * @returns {Promise<{ok:boolean, motivo?:string, respuesta?:object}>}
 */
async function enviarEvento({
  eventName,
  eventId,
  eventSourceUrl,
  actionSource = 'website',
  persona = {},
  navegador = {},
  customData = {},
  eventTime,
}) {
  if (!estaConfigurado()) {
    return { ok: false, motivo: 'Falta META_PIXEL_ID o META_ACCESS_TOKEN' };
  }

  const evento = {
    event_name: eventName,
    // Meta rechaza eventos con mas de 7 dias de antiguedad; se manda en segundos.
    event_time: Math.floor((eventTime || Date.now()) / 1000),
    event_id: eventId,
    action_source: actionSource,
    user_data: construirUserData(persona, navegador),
  };
  if (eventSourceUrl) evento.event_source_url = eventSourceUrl;
  if (customData && Object.keys(customData).length) evento.custom_data = customData;

  const cuerpo = { data: [evento] };
  // El codigo de prueba hace que el evento aparezca en "Probar eventos" del
  // Administrador de eventos sin ensuciar las metricas reales de la campana.
  if (process.env.META_TEST_EVENT_CODE) cuerpo.test_event_code = process.env.META_TEST_EVENT_CODE;

  const url = `https://graph.facebook.com/${API_VERSION}/${pixelId()}/events?access_token=${encodeURIComponent(accessToken())}`;

  const abortar = new AbortController();
  const reloj = setTimeout(() => abortar.abort(), TIMEOUT_MS);
  try {
    const respuesta = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
      signal: abortar.signal,
    });
    const json = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) {
      const motivo = json?.error?.message || `HTTP ${respuesta.status}`;
      console.error(`[meta] ${eventName} rechazado por Meta: ${motivo}`);
      return { ok: false, motivo, respuesta: json };
    }
    return { ok: true, respuesta: json };
  } catch (err) {
    const motivo = err.name === 'AbortError' ? 'Meta no respondio a tiempo' : err.message;
    console.error(`[meta] ${eventName} no se pudo enviar: ${motivo}`);
    return { ok: false, motivo };
  } finally {
    clearTimeout(reloj);
  }
}

// Un id de evento nuevo, para cuando la conversion nace en el servidor (por
// ejemplo Purchase desde el webhook de Mercado Pago) y no hay uno del navegador.
function nuevoEventId(prefijo = 'ev') {
  return `${prefijo}.${Date.now()}.${crypto.randomBytes(8).toString('hex')}`;
}

module.exports = {
  API_VERSION,
  EVENTOS_PERMITIDOS,
  estaConfigurado,
  pixelId,
  enviarEvento,
  nuevoEventId,
  datosDelNavegador,
  construirFbc,
  // Se exportan para las pruebas y para reutilizarlos desde otras rutas.
  hashEmail,
  hashTelefono,
  hashNombre,
};
