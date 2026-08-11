// El machote de campañas, adaptado de Endulcora a una clínica.
//
// La mecánica viene de las campañas que hoy corren en Endulcora (act_75151654)
// y que ya están probadas: campaña por servicio y sucursal, presupuesto en el
// conjunto, optimizar a conversaciones y mandar la gente a WhatsApp. Eso se
// queda igual porque funciona.
//
// Lo que cambia para Crenef, por ser clínica y no escuela de talleres:
//
//   Talleres (Endulcora)              Terapias (Crenef)
//   ─────────────────────────────     ──────────────────────────────────────
//   Evento con fecha; el anuncio      Servicio permanente; el anuncio corre
//   muere el día del taller           sin fecha de fin
//   Nombre "AGO26 · X · Sede"         Nombre "PERMANENTE · X · Sucursal"
//   25-55 años para todos             Edad por terapia: la de niños le habla
//                                     a los papás, la de adultos mayores no
//   Radio de 7 km                     Radio de 10 km: por una terapia la
//                                     gente sí se traslada más lejos
//   Copy: gancho, qué te llevas,      Copy: qué atiende la clínica, cómo es
//   duración, anticipo                la sesión, quién la da, agenda cita
//   Sin restricción de contenido      Política de salud de Meta: prohibido
//                                     hablarle a la persona de su condición
//                                     (ver politicas-salud.js)
//
// La fórmula de copy para clínica, en 4 bloques y siempre en tercera persona:
//   1. Qué atiende la clínica. "Terapia de lenguaje para niños de 3 a 12 años."
//   2. Cómo es la terapia, concreto. Sesiones, duración, en qué consiste.
//   3. Quién la da. Cédula, especialidad, años de experiencia: esto es lo que
//      da confianza en salud, más que cualquier adjetivo.
//   4. El siguiente paso, chico y sin compromiso. "Escríbenos y agenda tu
//      valoración." Nunca prometas el resultado del tratamiento.

const MESES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

// Valores del machote. Si te quieres desviar, hazlo en crenef.config.js
// (por sucursal o por terapia), no aquí.
const MACHOTE = {
  objetivo: 'OUTCOME_ENGAGEMENT',
  tipoDeCompra: 'AUCTION',
  metaDeOptimizacion: 'CONVERSATIONS',
  eventoDeFacturacion: 'IMPRESSIONS',
  estrategiaDePuja: 'LOWEST_COST_WITHOUT_CAP', // "Máximo volumen" en la interfaz
  destino: 'WHATSAPP',
  botonCta: 'WHATSAPP_MESSAGE',
  // Rango amplio a propósito: cada terapia debería acotarlo en la config.
  edadMin: 25,
  edadMax: 65,
  radioKm: 10,
  presupuestoDiarioMxn: 150,
};

// Los dos juegos de ubicaciones. "automaticas" es Advantage+ (Meta reparte
// donde quiera); "verticales" es solo pantalla completa, para creativos 9:16.
const UBICACIONES = {
  automaticas: null, // omitir publisher_platforms = Advantage+
  verticales: {
    publisher_platforms: ['facebook', 'instagram', 'whatsapp'],
    facebook_positions: ['story', 'facebook_reels'],
    instagram_positions: ['story', 'reels'],
    whatsapp_positions: ['status'],
  },
};

// "AGO26" a partir de una fecha ISO.
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

// Las terapias son servicio permanente, así que por omisión la campaña se llama
// "PERMANENTE". Si le pones `fin` (una promo o una temporada), se nombra con el
// mes, igual que las de Endulcora.
function nombreDeCampana({ terapia, sucursal, fin }) {
  const periodo = fin ? etiquetaDeMes(fin) : 'PERMANENTE';
  return `${periodo} · ${terapia} · ${sucursal}`;
}

function payloadDeCampana({ terapia, sucursal, fin }) {
  return {
    name: nombreDeCampana({ terapia, sucursal, fin }),
    objective: MACHOTE.objetivo,
    buying_type: MACHOTE.tipoDeCompra,
    // Siempre nace en pausa: se revisa y se prende a mano.
    status: 'PAUSED',
    // Salud NO es categoría especial en Meta (a diferencia de crédito, empleo o
    // vivienda). Las reglas de salud son de contenido, no de segmentación, y se
    // revisan en politicas-salud.js.
    special_ad_categories: [],
  };
}

function payloadDeConjunto({
  campanaId,
  terapia,
  sucursal,
  inicio,
  fin,
  ubicaciones,
  presupuestoDiarioMxn,
  edadMin,
  edadMax,
  radioKm,
}) {
  const juego = UBICACIONES[ubicaciones || 'automaticas'];
  if (juego === undefined) {
    throw new Error(`Ubicaciones desconocidas: "${ubicaciones}". Usa "automaticas" o "verticales".`);
  }

  const targeting = {
    age_min: edadMin || MACHOTE.edadMin,
    age_max: edadMax || MACHOTE.edadMax,
    geo_locations: {
      custom_locations: [
        {
          latitude: sucursal.latitud,
          longitude: sucursal.longitud,
          radius: radioKm || sucursal.radioKm || MACHOTE.radioKm,
          distance_unit: 'kilometer',
          address_string: sucursal.direccion,
        },
      ],
      // Solo quien vive en el radio, no quien anda de paso.
      location_types: ['home'],
    },
    // Sin públicos Advantage: el radio alrededor de la sucursal es la
    // segmentación. En salud tampoco hay intereses que se puedan usar sin
    // caer en segmentación por condición médica, que Meta ya no permite.
    targeting_automation: { advantage_audience: 0 },
    ...(juego || {}),
  };

  const pesos = presupuestoDiarioMxn || MACHOTE.presupuestoDiarioMxn;

  return {
    name: `${terapia} · ${sucursal.nombre}`,
    campaign_id: campanaId,
    // Meta pide el presupuesto en centavos.
    daily_budget: Math.round(pesos * 100),
    billing_event: MACHOTE.eventoDeFacturacion,
    optimization_goal: MACHOTE.metaDeOptimizacion,
    bid_strategy: MACHOTE.estrategiaDePuja,
    destination_type: MACHOTE.destino,
    // Para anuncios de "click a WhatsApp" el objeto promocionado es la página.
    promoted_object: { page_id: sucursal.paginaId },
    start_time: inicio,
    // Sin `fin`, el anuncio corre indefinidamente: es un servicio permanente.
    ...(fin ? { end_time: fin } : {}),
    targeting,
    status: 'PAUSED',
  };
}

function payloadDeCreativo({ nombre, copy, imagenHash, sucursal, whatsapp, mensajeInicial }) {
  const numero = String(whatsapp).replace(/\D/g, '');
  // El texto con el que arranca la conversación. En una clínica ayuda mucho:
  // la recepción sabe de qué terapia llega el paciente sin tener que preguntar.
  const enlace = mensajeInicial
    ? `https://wa.me/${numero}?text=${encodeURIComponent(mensajeInicial)}`
    : `https://wa.me/${numero}`;

  return {
    name: nombre,
    object_story_spec: {
      page_id: sucursal.paginaId,
      ...(sucursal.instagramId ? { instagram_user_id: sucursal.instagramId } : {}),
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

// Nombre del creativo: "Terapia_SUCURSAL" para lo permanente, o con la fecha
// de cierre adelante cuando es una campaña con temporada.
function nombreDeCreativo({ terapia, sucursal, fin }) {
  // Meta acepta acentos, pero los nombres sin ellos son más fáciles de buscar
  // y de exportar a hoja de cálculo.
  const sinAcentos = (texto) =>
    texto
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9]/g, '');

  const plano = sinAcentos(terapia);
  const sufijo = sinAcentos(sucursal.nombre).toUpperCase();
  if (!fin) return `${plano}_${sufijo}`;
  return `${fin.slice(0, 10).replace(/-/g, '')}_${plano}_${sufijo}`;
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
