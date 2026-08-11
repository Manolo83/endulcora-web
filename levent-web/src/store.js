// Mismo esquema de persistencia que Endulcora: todo el contenido dinamico vive
// en una sola fila JSONB de PostgreSQL. `data` se mantiene en memoria mientras
// el proceso corre (leer es instantaneo) y cada cambio se encola para guardarse
// en orden, sin bloquear la respuesta al navegador. init() debe terminar antes
// de que el servidor acepte peticiones.

const fs = require('fs');
const { Pool } = require('pg');
const { DATA_DIR, UPLOAD_DIR } = require('./config');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

if (!process.env.DATABASE_URL) {
  throw new Error(
    '[store] Falta la variable DATABASE_URL. Agrega el plugin de PostgreSQL en Railway (New > Database > PostgreSQL); Railway crea esta variable automaticamente.'
  );
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Todo esto se edita desde /admin sin tocar codigo ni volver a desplegar.
const DEFAULT_CONTENT = {
  hero_badge: 'Levent',
  hero_titulo_1: 'Cambia el titulo desde /admin',
  hero_titulo_2: 'en menos de un minuto.',
  hero_parrafo:
    'Este es el texto de arranque de la landing. Entra a /admin > Contenido y escribe la promesa real de Levent: que resuelves, para quien, y por que ahora.',
  hero_cta_primario: 'Quiero informacion',
  hero_cta_secundario: 'Hablar por WhatsApp',
  hero_imagen: '',

  prueba_1_valor: '0',
  prueba_1_etiqueta: 'Cifra 1',
  prueba_2_valor: '0',
  prueba_2_etiqueta: 'Cifra 2',
  prueba_3_valor: '0',
  prueba_3_etiqueta: 'Cifra 3',

  beneficios_titulo: 'Lo que te llevas',
  beneficio_1_titulo: 'Beneficio 1',
  beneficio_1_texto: 'Describe el primer beneficio concreto y medible.',
  beneficio_2_titulo: 'Beneficio 2',
  beneficio_2_texto: 'Describe el segundo beneficio concreto y medible.',
  beneficio_3_titulo: 'Beneficio 3',
  beneficio_3_texto: 'Describe el tercer beneficio concreto y medible.',

  form_titulo: 'Dejanos tus datos',
  form_texto: 'Te contactamos hoy mismo con la informacion completa y los precios.',
  form_boton: 'Quiero que me contacten',

  whatsapp_numero: '5215500000000',
  whatsapp_mensaje: 'Hola, vi el anuncio de Levent y quiero mas informacion.',

  gracias_titulo: 'Listo, ya tenemos tus datos',
  gracias_texto: 'Te escribimos por WhatsApp en las proximas horas. Si prefieres, escribenos tu ahora mismo.',

  footer_descripcion: 'Levent. Escribe aqui la descripcion corta del negocio.',
  legal_privacidad:
    'Levent es responsable del tratamiento de tus datos personales.\n\nQue recabamos. Nombre, correo electronico y telefono.\n\nPara que. Contactarte con la informacion que solicitaste y darte seguimiento comercial. No vendemos ni compartimos tus datos con terceros ajenos a este fin.\n\nTus derechos ARCO. Puedes acceder, rectificar, cancelar u oponerte al uso de tus datos escribiendo a nuestro WhatsApp. Respondemos en un maximo de 20 dias habiles.',
  legal_terminos:
    'Los precios estan en pesos mexicanos e incluyen IVA salvo que se indique lo contrario.\n\nEl pago en linea se procesa a traves de Mercado Pago; este sitio nunca ve ni guarda los datos de tu tarjeta.',
};

// La oferta que se vende en la landing. Una landing de campana funciona mejor
// con una sola oferta clara, pero el arreglo permite 2 o 3 planes.
const DEFAULT_OFERTAS = [
  {
    etiqueta: 'OFERTA PRINCIPAL',
    titulo: 'Nombre de lo que vendes',
    subtitulo: 'Una linea que lo describa',
    descripcion: 'Edita esta oferta en /admin > Oferta: nombre, precio, vinetas y texto del boton.',
    bullets: ['Primer entregable', 'Segundo entregable', 'Tercer entregable'],
    precio: '0',
    precioAnterior: '',
    boton: 'Inscribirme ahora',
    imagen: '',
    activo: true,
  },
];

let data = null;
let colaEscritura = Promise.resolve();

function datosPorDefecto() {
  return {
    content: { ...DEFAULT_CONTENT },
    ofertas: DEFAULT_OFERTAS.map((o, i) => ({ id: i + 1, orden: i, ...o })),
    leads: [],
    orders: [],
    // Bitacora corta de lo que se le mando a Meta, para diagnosticar la campana
    // desde /admin sin entrar al Administrador de eventos.
    eventosMeta: [],
  };
}

async function persistirAhora() {
  await pool.query('UPDATE app_data SET data = $1, updated_at = now() WHERE id = 1', [JSON.stringify(data)]);
}

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_data (
      id INT PRIMARY KEY DEFAULT 1,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  const res = await pool.query('SELECT data FROM app_data WHERE id = 1');
  if (res.rows.length) {
    data = res.rows[0].data;
    let changed = false;
    const defaults = datosPorDefecto();
    for (const key of Object.keys(defaults)) {
      if (!data[key]) {
        data[key] = defaults[key];
        changed = true;
      }
    }
    // Las claves de contenido nuevas que se agreguen en un despliegue posterior
    // aparecen solas, sin perder lo que ya habia escrito el administrador.
    for (const key of Object.keys(DEFAULT_CONTENT)) {
      if (!Object.prototype.hasOwnProperty.call(data.content, key)) {
        data.content[key] = DEFAULT_CONTENT[key];
        changed = true;
      }
    }
    if (changed) await persistirAhora();
  } else {
    data = datosPorDefecto();
    await pool.query('INSERT INTO app_data (id, data) VALUES (1, $1)', [JSON.stringify(data)]);
  }
  console.log('[store] Datos cargados desde PostgreSQL.');
}

function load() {
  if (!data) {
    throw new Error('[store] Los datos todavia no se han cargado (falta llamar a init antes de usar el store).');
  }
  return data;
}

function save() {
  colaEscritura = colaEscritura
    .then(() => persistirAhora())
    .catch((e) => console.error('[store] No se pudo guardar en la base de datos:', e.message));
}

function flush() {
  return colaEscritura;
}

function nextId(list) {
  return list.reduce((max, item) => Math.max(max, item.id), 0) + 1;
}

const MAX_EVENTOS_GUARDADOS = 200;

module.exports = {
  init,
  flush,
  UPLOAD_DIR,

  // ---- Contenido de la landing ----
  getContent() {
    return load().content;
  },
  updateContent(patch) {
    const data = load();
    Object.keys(patch).forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(data.content, key) && typeof patch[key] === 'string') {
        data.content[key] = patch[key];
      }
    });
    save();
    return data.content;
  },

  // ---- Oferta(s) ----
  getOfertas(soloActivas = false) {
    const data = load();
    const items = [...data.ofertas].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
    return soloActivas ? items.filter((o) => o.activo !== false) : items;
  },
  getOferta(id) {
    return load().ofertas.find((o) => o.id === Number(id)) || null;
  },
  addOferta(fields) {
    const data = load();
    const item = {
      id: nextId(data.ofertas),
      orden: data.ofertas.length,
      etiqueta: '',
      titulo: '',
      subtitulo: '',
      descripcion: '',
      bullets: [],
      precio: '',
      precioAnterior: '',
      boton: 'Comprar',
      imagen: '',
      activo: true,
      ...fields,
    };
    data.ofertas.push(item);
    save();
    return item;
  },
  updateOferta(id, patch) {
    const data = load();
    const item = data.ofertas.find((o) => o.id === Number(id));
    if (!item) return null;
    Object.assign(item, patch);
    save();
    return item;
  },
  deleteOferta(id) {
    const data = load();
    data.ofertas = data.ofertas.filter((o) => o.id !== Number(id));
    save();
  },

  // ---- Leads de la campana ----
  // Cada lead guarda de donde vino (utm_*, fbclid, anuncio) para poder decir
  // que campana de Meta trajo a cada persona, no solo cuantas hubo.
  addLead(fields) {
    const data = load();
    const item = {
      id: nextId(data.leads),
      nombre: '',
      email: '',
      telefono: '',
      mensaje: '',
      interes: '',
      origen: 'formulario',
      utm_source: '',
      utm_medium: '',
      utm_campaign: '',
      utm_content: '',
      utm_term: '',
      fbclid: '',
      landing: '',
      atendido: false,
      metaEnviado: false,
      creadoEn: new Date().toISOString(),
      ...fields,
    };
    data.leads.push(item);
    save();
    return item;
  },
  getLeads() {
    return [...load().leads].sort((a, b) => b.id - a.id);
  },
  getLead(id) {
    return load().leads.find((l) => l.id === Number(id)) || null;
  },
  updateLead(id, patch) {
    const data = load();
    const item = data.leads.find((l) => l.id === Number(id));
    if (!item) return null;
    Object.assign(item, patch);
    save();
    return item;
  },
  deleteLead(id) {
    const data = load();
    data.leads = data.leads.filter((l) => l.id !== Number(id));
    save();
  },

  // ---- Pedidos (venta directa con Mercado Pago) ----
  addOrder({ items, total, email, telefono, nombre, leadId, atribucion }) {
    const data = load();
    const order = {
      id: nextId(data.orders),
      items,
      total,
      email: email || '',
      telefono: telefono || '',
      nombre: nombre || '',
      leadId: leadId || null,
      atribucion: atribucion || {},
      estado: 'pendiente',
      mpPreferenceId: null,
      mpPaymentId: null,
      metaPurchaseEnviado: false,
      creadoEn: new Date().toISOString(),
    };
    data.orders.push(order);
    save();
    return order;
  },
  getOrders() {
    return [...load().orders].sort((a, b) => b.id - a.id);
  },
  getOrder(id) {
    return load().orders.find((o) => o.id === Number(id)) || null;
  },
  updateOrder(id, patch) {
    const data = load();
    const order = data.orders.find((o) => o.id === Number(id));
    if (!order) return null;
    Object.assign(order, patch);
    save();
    return order;
  },

  // ---- Bitacora de eventos enviados a Meta ----
  registrarEventoMeta({ eventName, eventId, ok, motivo, valor }) {
    const data = load();
    data.eventosMeta.unshift({
      eventName,
      eventId,
      ok: !!ok,
      motivo: motivo || '',
      valor: valor ?? null,
      enviadoEn: new Date().toISOString(),
    });
    // Solo interesa el pasado reciente para diagnosticar; sin este recorte la
    // fila JSONB creceria sin limite.
    if (data.eventosMeta.length > MAX_EVENTOS_GUARDADOS) {
      data.eventosMeta.length = MAX_EVENTOS_GUARDADOS;
    }
    save();
  },
  getEventosMeta() {
    return load().eventosMeta;
  },
};
