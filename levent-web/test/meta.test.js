// Prueba del cuerpo exacto que se le manda a la Conversions API de Meta.
//
// Es la parte del sistema que no avisa cuando se rompe: si el hash del correo
// se calcula mal o el event_id deja de propagarse, Meta sigue aceptando los
// eventos con un 200 y nadie se entera hasta que la campana lleva semanas
// optimizando con datos que no emparejan con ninguna persona real.
//
// Correr con: npm test

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');

process.env.META_PIXEL_ID = '1234567890';
process.env.META_ACCESS_TOKEN = 'TOKEN_DE_PRUEBA';
process.env.META_TEST_EVENT_CODE = 'TEST12345';

const meta = require('../src/meta');

const sha = (valor) => crypto.createHash('sha256').update(valor, 'utf8').digest('hex');

// Peticion tipica: alguien que llego desde un anuncio, detras del proxy de
// Railway, con la cookie que ya puso el Pixel.
const REQ_FALSO = {
  headers: { 'x-forwarded-for': '189.203.10.7, 10.0.0.1', 'user-agent': 'Mozilla/5.0 (iPhone)' },
  cookies: { _fbp: 'fb.1.1700000000000.987654321' },
  query: { fbclid: 'IwAR_clic_del_anuncio' },
  socket: {},
};

let fetchOriginal;
let capturado;

before(() => {
  fetchOriginal = global.fetch;
  global.fetch = async (url, opciones) => {
    capturado = { url, cuerpo: JSON.parse(opciones.body) };
    return { ok: true, json: async () => ({ events_received: 1 }) };
  };
});

after(() => {
  global.fetch = fetchOriginal;
});

async function enviarEventoDePrueba(extra = {}) {
  await meta.enviarEvento({
    eventName: 'Lead',
    eventId: 'lead.dedup.001',
    eventSourceUrl: 'https://www.levent.mx/?fbclid=IwAR_clic_del_anuncio',
    persona: {
      nombre: '  ANA María ',
      apellido: 'Ruiz-López',
      email: '  ANA@Ejemplo.COM ',
      telefono: '(55) 1234-5678',
      externalId: 'lead-1',
    },
    navegador: meta.datosDelNavegador(REQ_FALSO),
    customData: { content_name: 'Formulario', value: 350, currency: 'MXN' },
    ...extra,
  });
  return capturado.cuerpo.data[0];
}

describe('Conversions API', () => {
  test('el event_id se conserva, que es lo unico que deduplica contra el Pixel', async () => {
    const evento = await enviarEventoDePrueba();
    assert.strictEqual(evento.event_id, 'lead.dedup.001');
  });

  test('event_time va en segundos, no en milisegundos', async () => {
    const evento = await enviarEventoDePrueba();
    // Meta rechaza el evento si le llegan milisegundos: quedaria fechado en el
    // ano 58000 y fuera de la ventana de 7 dias.
    assert.strictEqual(String(evento.event_time).length, 10);
    assert.ok(Math.abs(evento.event_time - Date.now() / 1000) < 60);
  });

  test('normaliza antes de hashear, como exige Meta', async () => {
    const { user_data: ud } = await enviarEventoDePrueba();
    assert.strictEqual(ud.em[0], sha('ana@ejemplo.com'), 'correo: sin espacios y en minusculas');
    assert.strictEqual(ud.ph[0], sha('525512345678'), 'telefono: solo digitos, con lada de pais');
    assert.strictEqual(ud.fn[0], sha('ana maría'), 'nombre: minusculas, un solo espacio');
    assert.strictEqual(ud.ln[0], sha('ruizlópez'), 'apellido: sin puntuacion');
    assert.strictEqual(ud.external_id[0], sha('lead-1'));
  });

  test('ningun dato personal viaja en claro', async () => {
    const { user_data: ud } = await enviarEventoDePrueba();
    const serializado = JSON.stringify(ud);
    for (const dato of ['ana@ejemplo.com', 'ANA@Ejemplo.COM', '5512345678', 'Ana', 'Ruiz']) {
      assert.ok(!serializado.includes(dato), `se filtro "${dato}" sin hashear`);
    }
  });

  test('toma la IP del visitante, no la del proxy de Railway', async () => {
    const { user_data: ud } = await enviarEventoDePrueba();
    assert.strictEqual(ud.client_ip_address, '189.203.10.7');
    assert.strictEqual(ud.client_user_agent, 'Mozilla/5.0 (iPhone)');
  });

  test('usa la cookie _fbp y arma el _fbc desde el fbclid de la URL', async () => {
    const { user_data: ud } = await enviarEventoDePrueba();
    assert.strictEqual(ud.fbp, 'fb.1.1700000000000.987654321');
    // Formato obligatorio: fb.1.<milisegundos>.<fbclid>
    assert.match(ud.fbc, /^fb\.1\.\d{13}\.IwAR_clic_del_anuncio$/);
  });

  test('el valor y la moneda llegan en custom_data', async () => {
    const evento = await enviarEventoDePrueba();
    assert.strictEqual(evento.custom_data.value, 350);
    assert.strictEqual(evento.custom_data.currency, 'MXN');
  });

  test('incluye el codigo de prueba cuando esta configurado', async () => {
    await enviarEventoDePrueba();
    assert.strictEqual(capturado.cuerpo.test_event_code, 'TEST12345');
    assert.match(capturado.url, /graph\.facebook\.com\/v\d+\.\d+\/1234567890\/events/);
  });

  test('un fallo de red no lanza: el visitante no puede verse afectado', async () => {
    const anterior = global.fetch;
    global.fetch = async () => {
      throw new Error('sin conexion');
    };
    const resultado = await meta.enviarEvento({ eventName: 'Lead', eventId: 'x' });
    global.fetch = anterior;
    assert.strictEqual(resultado.ok, false);
    assert.strictEqual(resultado.motivo, 'sin conexion');
  });
});

describe('normalizacion de telefonos mexicanos', () => {
  test('un numero a 10 digitos recibe la lada 52', () => {
    assert.strictEqual(meta.hashTelefono('5512345678'), sha('525512345678'));
    assert.strictEqual(meta.hashTelefono('55-1234-5678'), sha('525512345678'));
    assert.strictEqual(meta.hashTelefono('(55) 1234 5678'), sha('525512345678'));
  });

  test('un numero que ya trae lada no la recibe dos veces', () => {
    assert.strictEqual(meta.hashTelefono('+52 55 1234 5678'), sha('525512345678'));
  });

  test('un numero incompleto o vacio no se manda', () => {
    assert.strictEqual(meta.hashTelefono('1234'), null);
    assert.strictEqual(meta.hashTelefono(''), null);
    assert.strictEqual(meta.hashTelefono(null), null);
  });
});

describe('lista blanca de eventos', () => {
  test('acepta los eventos estandar de la campana', () => {
    for (const nombre of ['Lead', 'Contact', 'CompleteRegistration', 'ViewContent', 'InitiateCheckout']) {
      assert.ok(meta.EVENTOS_PERMITIDOS.has(nombre), `${nombre} deberia estar permitido`);
    }
  });

  test('rechaza nombres inventados, que serviran para inflar conversiones', () => {
    assert.ok(!meta.EVENTOS_PERMITIDOS.has('Purchase'), 'Purchase solo lo manda el servidor');
    assert.ok(!meta.EVENTOS_PERMITIDOS.has('InflarConversiones'));
  });
});
