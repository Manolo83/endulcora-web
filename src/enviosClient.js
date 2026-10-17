// Cliente del servicio aparte "envios" (carpeta envios/ de este mismo
// repo, desplegado como OTRO servicio en Railway): ahi ya vive, probado y
// con datos reales, el envio de reconocimientos con folio consecutivo y
// la plantilla de Canva. En vez de reconstruir eso aqui, el portal de Lex
// le habla por detras, entrando con la misma contraseña compartida que
// usarian Lex o Alek desde su propio navegador — mismo efecto, sin que
// ella tenga que salir de este portal.
const { ENVIOS } = require('./config');

function configurado() {
  return Boolean(ENVIOS.url && ENVIOS.password);
}

function faltantes() {
  const falta = [];
  if (!ENVIOS.url) falta.push('ENVIOS_API_URL');
  if (!ENVIOS.password) falta.push('ENVIOS_APP_PASSWORD');
  return falta;
}

// La sesion de "envios" es una cookie normal (cookie-session), igual que
// la del propio portal de Lex. Se guarda en memoria y se reutiliza entre
// peticiones; si alguna vez deja de servir (el proceso de "envios" se
// reinicio y perdio la sesion), se vuelve a entrar sola.
let cookieEnCache = '';

async function entrar() {
  const res = await fetch(`${ENVIOS.url}/api/entrar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clave: ENVIOS.password, quien: 'Lex (portal)' }),
  });
  if (!res.ok) {
    const cuerpo = await res.json().catch(() => ({}));
    throw new Error(cuerpo.error || 'No se pudo entrar al servicio de reconocimientos.');
  }
  // cookie-session manda DOS cookies (los datos de la sesion y su firma
  // aparte) -- hay que guardar y reenviar las dos, no solo la primera, o
  // el servicio nunca la valida como real.
  const crudas = typeof res.headers.getSetCookie === 'function'
    ? res.headers.getSetCookie()
    : (res.headers.get('set-cookie') || '').split(/,(?=[^;]+?=)/);
  if (!crudas.length) throw new Error('El servicio de reconocimientos no regresó una sesión.');
  cookieEnCache = crudas.map((c) => c.split(';')[0].trim()).join('; ');
}

async function llamar(ruta, options = {}, reintentando = false) {
  if (!configurado()) {
    throw new Error(`El envío de reconocimientos no está configurado: ${faltantes().join(', ')}.`);
  }
  if (!cookieEnCache) await entrar();
  const res = await fetch(`${ENVIOS.url}${ruta}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieEnCache,
      ...(options.headers || {}),
    },
  });
  if (res.status === 401 && !reintentando) {
    cookieEnCache = '';
    return llamar(ruta, options, true);
  }
  const cuerpo = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(cuerpo.error || 'El servicio de reconocimientos respondió con un error.');
  return cuerpo;
}

// participantes: [{ nombre, email }]. Regresa el mismo "envio" que
// devuelve /api/enviar en el servicio: resultados por persona (con su
// folio si salio bien), enviados y fallidos.
function enviarReconocimientos({ taller, fecha, participantes }) {
  return llamar('/api/enviar', { method: 'POST', body: JSON.stringify({ taller, fecha, participantes }) });
}

// Solo para revisar que la conexion funciona, sin mandar nada ni gastar
// ningun folio -- es la misma consulta de estado que usa su propia
// pantalla de inicio.
function estado() {
  return llamar('/api/sesion');
}

module.exports = { configurado, faltantes, enviarReconocimientos, estado };
