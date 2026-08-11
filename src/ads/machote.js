// El "machote" de Endulcora: la receta exacta con la que están armadas las
// campañas que hoy corren en la cuenta de Endulcora (act_75151654), sacada de
// las campañas reales y convertida en funciones para poder repetirla con otra
// marca sin volver a decidir nada.
//
// Resumen de la receta, por si algún día hay que revisarla en el Administrador
// de anuncios:
//
//   Campaña   1 por taller y por sede · objetivo Interacción (OUTCOME_ENGAGEMENT)
//             · subasta · presupuesto en el conjunto, no en la campaña (ABO)
//   Conjunto  $150 MXN al día · máximo volumen · optimizar por CONVERSATIONS
//             · destino WhatsApp · 25 a 55 años · radio de 7 km alrededor de la
//             sede, solo gente que vive ahí · termina el día del taller
//   Anuncio   imagen única · botón "Enviar mensaje por WhatsApp" · el copy sigue
//             la fórmula de 4 bloques de abajo
//
// La fórmula del copy (así están escritos todos los anuncios de Endulcora):
//   1. Un gancho de una línea, casi siempre un contraste o una tensión.
//   2. Qué se lleva la persona, concreto y en nombres propios.
//   3. Formato: "Taller presencial de 4 horas. Para principiantes."
//   4. Cierre con la acción y el anticipo: "Escríbenos y aparta tu lugar con $400."

const MESES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

// Valores del machote que no cambian entre marcas. Si quieres desviarte de la
// receta, hazlo en la config de la marca, no aquí.
const MACHOTE = {
  objetivo: 'OUTCOME_ENGAGEMENT',
  tipoDeCompra: 'AUCTION',
  metaDeOptimizacion: 'CONVERSATIONS',
  eventoDeFacturacion: 'IMPRESSIONS',
  estrategiaDePuja: 'LOWEST_COST_WITHOUT_CAP', // "Máximo volumen" en la interfaz
  destino: 'WHATSAPP',
  edadMin: 25,
  edadMax: 55,
  radioKm: 7,
  presupuestoDiarioMxn: 150,
  botonCta: 'WHATSAPP_MESSAGE',
};

// Los dos juegos de ubicaciones que usa Endulcora. "automaticas" es Advantage+
// (Meta reparte donde quiera); "verticales" es solo formatos de pantalla
// completa, para creativos 9:16.
const UBICACIONES = {
  automaticas: null, // omitir publisher_platforms = Advantage+
  verticales: {
    publisher_platforms: ['facebook', 'instagram', 'whatsapp'],
    facebook_positions: ['story', 'facebook_reels'],
    instagram_positions: ['story', 'reels'],
    whatsapp_positions: ['status'],
  },
};

// "AGO26" a partir de una fecha ISO. Es el prefijo del nombre de la campaña.
function etiquetaDeMes(fechaIso) {
  const [anio, mes] = fechaIso.slice(0, 10).split('-');
  return `${MESES[Number(mes) - 1]}${anio.slice(2)}`;
}

// Convierte "2026-09-15 20:00" en "2026-09-15T20:00:00-06:00".
//
// Meta interpreta las fechas en la zona horaria de la cuenta publicitaria, así
// que mandamos el desfase escrito para que no haya sorpresas. CDMX es -06:00
// todo el año desde que México quitó el horario de verano.
function fecha(textoLocal, desfase = '-06:00') {
  const [dia, hora = '00:00'] = String(textoLocal).trim().split(/\s+/);
  const conSegundos = hora.length === 5 ? `${hora}:00` : hora;
  return `${dia}T${conSegundos}${desfase}`;
}

function nombreDeCampana({ taller, sede, inicio }) {
  return `${etiquetaDeMes(inicio)} · ${taller} · ${sede}`;
}

function payloadDeCampana({ taller, sede, inicio }) {
  return {
    name: nombreDeCampana({ taller, sede, inicio }),
    objective: MACHOTE.objetivo,
    buying_type: MACHOTE.tipoDeCompra,
    // Siempre nace en pausa: las campañas se revisan y se prenden a mano.
    status: 'PAUSED',
    special_ad_categories: [],
  };
}

function payloadDeConjunto({ campanaId, taller, sede, inicio, fin, ubicaciones, presupuestoDiarioMxn }) {
  const juego = UBICACIONES[ubicaciones || 'automaticas'];
  if (juego === undefined) {
    throw new Error(`Ubicaciones desconocidas: "${ubicaciones}". Usa "automaticas" o "verticales".`);
  }

  const targeting = {
    age_min: MACHOTE.edadMin,
    age_max: MACHOTE.edadMax,
    geo_locations: {
      custom_locations: [
        {
          latitude: sede.latitud,
          longitude: sede.longitud,
          radius: MACHOTE.radioKm,
          distance_unit: 'kilometer',
          address_string: sede.direccion,
        },
      ],
      // Solo quien vive en el radio, no quien anda de paso.
      location_types: ['home'],
    },
    // Sin públicos Advantage: el radio de 7 km es la segmentación.
    targeting_automation: { advantage_audience: 0 },
    ...(juego || {}),
  };

  const pesos = presupuestoDiarioMxn || MACHOTE.presupuestoDiarioMxn;

  return {
    name: `${taller} · ${sede.nombre}`,
    campaign_id: campanaId,
    // Meta pide el presupuesto en centavos.
    daily_budget: Math.round(pesos * 100),
    billing_event: MACHOTE.eventoDeFacturacion,
    optimization_goal: MACHOTE.metaDeOptimizacion,
    bid_strategy: MACHOTE.estrategiaDePuja,
    destination_type: MACHOTE.destino,
    // Para anuncios de "click a WhatsApp" el objeto promocionado es la página.
    promoted_object: { page_id: sede.paginaId },
    start_time: inicio,
    end_time: fin,
    targeting,
    status: 'PAUSED',
  };
}

function payloadDeCreativo({ nombre, copy, imagenHash, sede, whatsapp }) {
  const enlace = `https://wa.me/${String(whatsapp).replace(/\D/g, '')}`;

  return {
    name: nombre,
    object_story_spec: {
      page_id: sede.paginaId,
      ...(sede.instagramId ? { instagram_user_id: sede.instagramId } : {}),
      link_data: {
        image_hash: imagenHash,
        message: copy,
        link: enlace,
        call_to_action: {
          type: MACHOTE.botonCta,
          value: { app_destination: 'WHATSAPP', link: enlace },
        },
      },
    },
  };
}

function payloadDeAnuncio({ nombre, conjuntoId, creativoId }) {
  return {
    name: nombre,
    adset_id: conjuntoId,
    creative: { creative_id: creativoId },
    status: 'PAUSED',
  };
}

// El nombre del creativo/anuncio en Endulcora es "AAAAMMDD_TallerSinEspacios_SEDE".
function nombreDeCreativo({ taller, sede, fin }) {
  const dia = fin.slice(0, 10).replace(/-/g, '');
  const tallerPlano = taller
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita los acentos
    .replace(/[^A-Za-z0-9]/g, '');
  return `${dia}_${tallerPlano}_${sede.nombre.toUpperCase()}`;
}

module.exports = {
  MACHOTE,
  UBICACIONES,
  fecha,
  etiquetaDeMes,
  nombreDeCampana,
  nombreDeCreativo,
  payloadDeCampana,
  payloadDeConjunto,
  payloadDeCreativo,
  payloadDeAnuncio,
};
