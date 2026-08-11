'use strict';

// El "machote": la estructura de campaña que ya funciona en Endulcora.
//
// Cada oferta (un taller, un curso) se convierte en:
//   1 campaña  ->  1 conjunto de anuncios  ->  1 creativo  ->  1 anuncio
//
// con presupuesto en el conjunto (ABO), objetivo Interacción optimizado a
// CONVERSACIONES y destino WhatsApp. Es exactamente lo que corre hoy en la
// cuenta de Endulcora; Instituto Justo usa el mismo motor con otra config.

const OBJETIVO = 'OUTCOME_ENGAGEMENT';
const TIPO_COMPRA = 'AUCTION';
const EVENTO_FACTURACION = 'IMPRESSIONS';
const ESTRATEGIA_PUJA = 'LOWEST_COST_WITHOUT_CAP';
const META_OPTIMIZACION = 'CONVERSATIONS';

// Zona horaria de las cuentas (CDMX). Meta guarda las fechas en la zona de la
// cuenta, así que las mandamos con offset explícito para que no se recorran.
const OFFSET = '-06:00';

const DESTINOS = {
  whatsapp: {
    destinationType: 'WHATSAPP',
    cta: 'WHATSAPP_MESSAGE',
    appDestination: 'WHATSAPP',
    enlace: (cuenta) => {
      const numero = String(cuenta.whatsapp || '').replace(/\D/g, '');
      if (!numero) {
        throw new Error(
          `La cuenta "${cuenta.clave}" usa destino WhatsApp pero no tiene número.\n` +
            'Ponlo en su archivo de ads/cuentas/ (campo whatsapp) o en la variable de entorno correspondiente.'
        );
      }
      return `https://wa.me/${numero}`;
    },
  },
  messenger: {
    destinationType: 'MESSENGER',
    cta: 'MESSAGE_PAGE',
    appDestination: 'MESSENGER',
    enlace: (cuenta) => `https://m.me/${cuenta.pageId}`,
  },
  instagram: {
    destinationType: 'INSTAGRAM_DIRECT',
    cta: 'MESSAGE_PAGE',
    appDestination: 'INSTAGRAM_DIRECT',
    enlace: (cuenta) => `https://ig.me/m/${cuenta.instagramUsuario || ''}`,
  },
};

// "2026-08-29" -> "2026-08-29T23:59:00-06:00"
function fechaMeta(dia, hora = '23:59:00') {
  if (!dia) return undefined;
  if (String(dia).includes('T')) return dia;
  return `${dia}T${hora}${OFFSET}`;
}

// Un taller que es el 30 de agosto deja de anunciarse la noche del 29.
function visperaDe(dia) {
  if (!dia) return undefined;
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function normaliza(texto) {
  return String(texto)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '');
}

function nombreCampana({ cuenta, oferta, sede }) {
  const partes = [cuenta.etiquetaPeriodo, oferta.nombre, sede.nombre].filter(Boolean);
  return partes.join(' · ');
}

function nombreConjunto({ oferta, sede }) {
  return `${oferta.nombre} · ${sede.nombre}`;
}

// Mismo formato que usa Endulcora: 20260826_PostresConNogada_NATIVITAS
function nombreCreativo({ oferta, sede }) {
  const fecha = (oferta.terminaEl || oferta.fechaEvento || '').replace(/-/g, '');
  const base = `${normaliza(oferta.nombre)}_${normaliza(sede.nombre).toUpperCase()}`;
  return fecha ? `${fecha}_${base}` : base;
}

function segmentacion({ oferta, sede }) {
  const publico = oferta.publico || {};
  const targeting = {
    age_min: publico.edadMin ?? 25,
    age_max: publico.edadMax ?? 55,
    geo_locations: {
      custom_locations: [
        {
          latitude: sede.latitud,
          longitude: sede.longitud,
          radius: sede.radioKm ?? 7,
          distance_unit: 'kilometer',
        },
      ],
      location_types: sede.tiposUbicacion || ['home'],
    },
    // Sin esto, Meta trata las edades como sugerencia y se sale del rango.
    targeting_automation: { advantage_audience: 0 },
  };
  if (publico.generos && publico.generos.length) targeting.genders = publico.generos;
  if (publico.idiomas && publico.idiomas.length) targeting.locales = publico.idiomas;
  return targeting;
}

// Arma el plan completo de una oferta en una sede, sin tocar la API todavía.
// Así se puede revisar en seco antes de publicar.
function planDeOferta({ cuenta, oferta, sede }) {
  const destino = DESTINOS[oferta.destino || cuenta.destino || 'whatsapp'];
  if (!destino) {
    throw new Error(`Destino desconocido: ${oferta.destino || cuenta.destino}`);
  }
  const enlace = destino.enlace(cuenta);

  const terminaEl = oferta.terminaEl || (oferta.fechaEvento ? visperaDe(oferta.fechaEvento) : null);
  const creativo = oferta.creativo || {};

  return {
    clave: `${oferta.clave}·${sede.clave}`,
    oferta,
    sede,
    destino: oferta.destino || cuenta.destino || 'whatsapp',
    enlace,

    campana: {
      name: nombreCampana({ cuenta, oferta, sede }),
      objective: OBJETIVO,
      buying_type: TIPO_COMPRA,
      special_ad_categories: [],
      status: 'PAUSED',
    },

    conjunto: {
      name: nombreConjunto({ oferta, sede }),
      daily_budget: oferta.presupuestoDiarioCentavos ?? cuenta.presupuestoDiarioCentavos,
      billing_event: EVENTO_FACTURACION,
      optimization_goal: META_OPTIMIZACION,
      bid_strategy: ESTRATEGIA_PUJA,
      destination_type: destino.destinationType,
      promoted_object: { page_id: cuenta.pageId },
      targeting: segmentacion({ oferta, sede }),
      start_time: fechaMeta(oferta.empiezaEl, '00:01:00'),
      end_time: fechaMeta(terminaEl),
      status: 'PAUSED',
    },

    creativo: {
      name: nombreCreativo({ oferta, sede }),
      imagen: creativo.imagen || null,
      imageHash: creativo.imageHash || null,
      objectStorySpec: {
        page_id: cuenta.pageId,
        instagram_user_id: cuenta.instagramId || undefined,
        link_data: {
          link: enlace,
          message: creativo.texto,
          name: creativo.encabezado,
          description: creativo.descripcion || undefined,
          call_to_action: {
            type: destino.cta,
            value: { app_destination: destino.appDestination, link: enlace },
          },
        },
      },
    },

    anuncio: {
      name: `${oferta.nombre} · ${sede.nombre}`,
      status: 'PAUSED',
    },
  };
}

// Todas las combinaciones oferta × sede de una cuenta.
function planDeCuenta(cuenta, { soloOfertas = null } = {}) {
  const sedesPorClave = new Map(cuenta.sedes.map((s) => [s.clave, s]));
  const planes = [];

  for (const oferta of cuenta.ofertas) {
    if (soloOfertas && !soloOfertas.includes(oferta.clave)) continue;
    const claves = oferta.sedes && oferta.sedes.length ? oferta.sedes : cuenta.sedes.map((s) => s.clave);
    for (const claveSede of claves) {
      const sede = sedesPorClave.get(claveSede);
      if (!sede) throw new Error(`La oferta "${oferta.clave}" apunta a una sede inexistente: ${claveSede}`);
      planes.push(planDeOferta({ cuenta, oferta, sede }));
    }
  }
  return planes;
}

module.exports = {
  OBJETIVO,
  TIPO_COMPRA,
  EVENTO_FACTURACION,
  ESTRATEGIA_PUJA,
  META_OPTIMIZACION,
  DESTINOS,
  fechaMeta,
  visperaDe,
  planDeOferta,
  planDeCuenta,
};
