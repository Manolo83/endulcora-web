// Reportes de gasto y resultados, para poder preguntar desde aqui "como van
// las campanas" de cualquiera de los cuatro negocios.

const { buscar } = require('./api');
const negocios = require('./negocios');

// Google guarda el dinero en "micros": 1 peso = 1,000,000 micros.
function pesos(micros) {
  return Math.round((Number(micros || 0) / 1_000_000) * 100) / 100;
}

function rangoGAQL(dias) {
  const n = Math.max(1, Math.min(365, parseInt(dias, 10) || 30));
  const hasta = new Date();
  const desde = new Date(hasta.getTime() - (n - 1) * 24 * 60 * 60 * 1000);
  const iso = (d) => d.toISOString().slice(0, 10);
  return { desde: iso(desde), hasta: iso(hasta), dias: n };
}

// Rendimiento por campana de un negocio.
async function rendimiento(clave, dias = 30) {
  const negocio = negocios.obtener(clave);
  if (!negocio.customerId) {
    return { negocio: negocio.clave, nombre: negocio.nombre, sinCuenta: true, campanas: [], totales: vacio() };
  }

  const { desde, hasta } = rangoGAQL(dias);
  const filas = await buscar(
    negocio.customerId,
    `SELECT
       campaign.id,
       campaign.name,
       campaign.status,
       campaign.advertising_channel_type,
       metrics.impressions,
       metrics.clicks,
       metrics.cost_micros,
       metrics.conversions,
       metrics.conversions_value
     FROM campaign
     WHERE segments.date BETWEEN '${desde}' AND '${hasta}'
     ORDER BY metrics.cost_micros DESC`
  );

  const campanas = filas.map((f) => {
    const c = f.campaign || {};
    const m = f.metrics || {};
    return {
      id: String(c.id || ''),
      nombre: c.name || '',
      estado: c.status || '',
      canal: c.advertisingChannelType || '',
      impresiones: Number(m.impressions || 0),
      clics: Number(m.clicks || 0),
      costo: pesos(m.costMicros),
      conversiones: Number(m.conversions || 0),
      valorConversiones: Number(m.conversionsValue || 0),
    };
  });

  return {
    negocio: negocio.clave,
    nombre: negocio.nombre,
    moneda: negocio.moneda,
    desde,
    hasta,
    campanas,
    totales: sumar(campanas),
  };
}

function vacio() {
  return { impresiones: 0, clics: 0, costo: 0, conversiones: 0, valorConversiones: 0, cpa: 0, roas: 0 };
}

function sumar(campanas) {
  const t = campanas.reduce((acc, c) => ({
    impresiones: acc.impresiones + c.impresiones,
    clics: acc.clics + c.clics,
    costo: acc.costo + c.costo,
    conversiones: acc.conversiones + c.conversiones,
    valorConversiones: acc.valorConversiones + c.valorConversiones,
  }), { impresiones: 0, clics: 0, costo: 0, conversiones: 0, valorConversiones: 0 });

  t.costo = Math.round(t.costo * 100) / 100;
  t.conversiones = Math.round(t.conversiones * 100) / 100;
  t.valorConversiones = Math.round(t.valorConversiones * 100) / 100;
  t.cpa = t.conversiones ? Math.round((t.costo / t.conversiones) * 100) / 100 : 0;
  t.roas = t.costo ? Math.round((t.valorConversiones / t.costo) * 100) / 100 : 0;
  return t;
}

// Un solo resumen con los cuatro negocios, para la vista general.
async function resumenGeneral(dias = 30) {
  const salida = [];
  for (const negocio of negocios.listar()) {
    try {
      salida.push(await rendimiento(negocio.clave, dias));
    } catch (err) {
      salida.push({ negocio: negocio.clave, nombre: negocio.nombre, error: err.message, campanas: [], totales: vacio() });
    }
  }
  return salida;
}

module.exports = { rendimiento, resumenGeneral, pesos, rangoGAQL };
