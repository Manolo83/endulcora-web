// Conversiones de Google Ads: crear las acciones de conversion de cada negocio
// y subir las ventas desde el servidor (el equivalente a la API de
// Conversiones de Meta que ya usamos en src/metaConversions.js).

const crypto = require('crypto');
const { llamar, buscar, configurado } = require('./api');
const { GOOGLE_ADS } = require('../config');
const negocios = require('./negocios');

// Acciones de conversion que le damos de alta a cualquier negocio nuevo. Son
// las cuatro que casi siempre se necesitan; despues cada negocio puede tener
// las suyas.
const ACCIONES_ESTANDAR = [
  { nombre: 'Compra (web)', categoria: 'PURCHASE', conteo: 'MANY_PER_CLICK', principal: true },
  { nombre: 'Inicio de compra', categoria: 'BEGIN_CHECKOUT', conteo: 'ONE_PER_CLICK', principal: false },
  { nombre: 'Contacto por WhatsApp', categoria: 'CONTACT', conteo: 'ONE_PER_CLICK', principal: true },
  { nombre: 'Registro / formulario', categoria: 'SUBMIT_LEAD_FORM', conteo: 'ONE_PER_CLICK', principal: true },
];

function sha256(valor) {
  return crypto.createHash('sha256').update(String(valor).trim().toLowerCase()).digest('hex');
}

// Google exige la fecha en formato "aaaa-mm-dd hh:mm:ss+hh:mm", en la zona
// horaria de la cuenta.
function fechaParaGoogle(fecha, zona = 'America/Mexico_City') {
  const d = fecha instanceof Date ? fecha : new Date(fecha || Date.now());
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: zona,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZoneName: 'longOffset',
  }).formatToParts(d);

  const v = (tipo) => (partes.find((p) => p.type === tipo) || {}).value || '';
  const hora = v('hour') === '24' ? '00' : v('hour');
  const offsetCrudo = v('timeZoneName').replace('GMT', '') || '+00:00';
  const offset = /^[+-]\d{2}:\d{2}$/.test(offsetCrudo) ? offsetCrudo : '+00:00';

  return `${v('year')}-${v('month')}-${v('day')} ${hora}:${v('minute')}:${v('second')}${offset}`;
}

// Da de alta las acciones de conversion estandar en la cuenta de un negocio.
// Si alguna ya existe con el mismo nombre, se respeta la que ya estaba.
async function crearAccionesEstandar(clave, { acciones = ACCIONES_ESTANDAR } = {}) {
  const negocio = negocios.obtener(clave);
  if (!negocio.customerId) {
    throw new Error(`El negocio ${negocio.nombre} todavia no tiene cuenta configurada (${negocio.envCuenta}).`);
  }

  const existentes = await listarAcciones(clave);
  const yaEstan = new Set(existentes.map((a) => a.nombre.toLowerCase()));

  const operaciones = acciones
    .filter((a) => !yaEstan.has(a.nombre.toLowerCase()))
    .map((a) => ({
      create: {
        name: a.nombre,
        type: 'WEBPAGE',
        category: a.categoria,
        status: 'ENABLED',
        primaryForGoal: a.principal !== false,
        countingType: a.conteo || 'ONE_PER_CLICK',
        clickThroughLookbackWindowDays: 30,
        viewThroughLookbackWindowDays: 1,
        valueSettings: {
          defaultValue: 0,
          defaultCurrencyCode: negocio.moneda,
          alwaysUseDefaultValue: false,
        },
      },
    }));

  if (!operaciones.length) {
    return { negocio: negocio.clave, creadas: [], omitidas: acciones.map((a) => a.nombre), acciones: existentes };
  }

  await llamar(`customers/${negocio.customerId}/conversionActions:mutate`, {
    body: { operations: operaciones, partialFailure: false },
  });

  const finales = await listarAcciones(clave);
  return {
    negocio: negocio.clave,
    creadas: operaciones.map((o) => o.create.name),
    omitidas: acciones.filter((a) => yaEstan.has(a.nombre.toLowerCase())).map((a) => a.nombre),
    acciones: finales,
  };
}

// Acciones de conversion de la cuenta, con la etiqueta que necesita el sitio
// web (AW-XXXXXXXXXX/AbC-D_efGhIjKl) y el ID numerico que necesita el servidor.
async function listarAcciones(clave) {
  const negocio = negocios.obtener(clave);
  if (!negocio.customerId) return [];

  const filas = await buscar(
    negocio.customerId,
    `SELECT
       conversion_action.id,
       conversion_action.name,
       conversion_action.category,
       conversion_action.status,
       conversion_action.type,
       conversion_action.tag_snippets
     FROM conversion_action
     WHERE conversion_action.status != 'REMOVED'`
  );

  return filas.map((f) => {
    const a = f.conversionAction || {};
    const snippets = a.tagSnippets || [];
    // La etiqueta "send_to" vive dentro del snippet de gtag.js.
    const conEtiqueta = snippets
      .map((s) => (s.eventSnippet || '').match(/send_to['"]?\s*:\s*['"]([^'"]+)['"]/))
      .find(Boolean);
    return {
      id: String(a.id || ''),
      nombre: a.name || '',
      categoria: a.category || '',
      estado: a.status || '',
      tipo: a.type || '',
      etiqueta: conEtiqueta ? conEtiqueta[1] : '',
    };
  });
}

// Sube al servidor la compra de Endulcora, como respaldo de la etiqueta del
// navegador. Google desduplica con el mismo orderId, asi que si las dos llegan
// cuenta una sola venta.
//
// Nunca lanza: la medicion jamas debe frenar ni romper una venta.
async function enviarCompraGoogle({ order, clave = 'endulcora' }) {
  try {
    if (!configurado() || !GOOGLE_ADS.conversionCompraId) {
      console.log('[google-ads] Sin credenciales o sin GOOGLE_ADS_CONVERSION_COMPRA_ID; se omite el envio de la compra.');
      return;
    }

    const negocio = negocios.obtener(clave);
    if (!negocio.customerId) {
      console.log(`[google-ads] ${negocio.nombre} no tiene cuenta configurada (${negocio.envCuenta}); se omite el envio.`);
      return;
    }

    // Sin identificador de clic no hay nada que atribuir: la venta llego por
    // otro canal (o el comprador entro sin pasar por un anuncio).
    const clic = {};
    if (order.gclid) clic.gclid = order.gclid;
    else if (order.wbraid) clic.wbraid = order.wbraid;
    else if (order.gbraid) clic.gbraid = order.gbraid;

    const identificadores = [];
    if (order.email) identificadores.push({ hashedEmail: sha256(order.email), userIdentifierSource: 'FIRST_PARTY' });

    if (!Object.keys(clic).length && !identificadores.length) {
      console.log(`[google-ads] El pedido ${order.id} no trae gclid ni correo; no hay nada que subir a Google.`);
      return;
    }

    const conversion = {
      ...clic,
      conversionAction: `customers/${negocio.customerId}/conversionActions/${GOOGLE_ADS.conversionCompraId}`,
      conversionDateTime: fechaParaGoogle(order.updatedAt || order.createdAt, negocio.zona),
      conversionValue: Number(order.total) || 0,
      currencyCode: negocio.moneda,
      orderId: `orden-${order.id}`,
      ...(identificadores.length ? { userIdentifiers: identificadores } : {}),
    };

    const data = await llamar(`customers/${negocio.customerId}:uploadClickConversions`, {
      body: { conversions: [conversion], partialFailure: true },
    });

    if (data.partialFailureError) {
      console.error(`[google-ads] Google rechazo la compra del pedido ${order.id}:`, JSON.stringify(data.partialFailureError).slice(0, 600));
      return;
    }
    console.log(`[google-ads] Compra del pedido ${order.id} enviada a Google Ads (orderId=orden-${order.id}).`);
  } catch (err) {
    console.error(`[google-ads] No se pudo enviar la compra del pedido ${order.id}:`, err.message);
  }
}

module.exports = {
  ACCIONES_ESTANDAR,
  crearAccionesEstandar,
  listarAcciones,
  enviarCompraGoogle,
  fechaParaGoogle,
};
