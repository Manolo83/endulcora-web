'use strict';

// Instituto Justo, armado con el mismo machote que Endulcora.
//
// Datos tomados de la cuenta publicitaria que ya existe (541486784443144) y de
// las campañas "Curso de Matemáticas" y "Regularización" que corrieron en
// julio: misma página, misma zona de Coyoacán, mismos precios.
//
// ANTES DE PUBLICAR revisa lo marcado con REVISAR:
//   - el número de WhatsApp (o cambia `destino` a 'messenger')
//   - las fechas de cada oferta
//   - las imágenes en ads/creativos/instituto-justo/
//
// Si todavía no hay imágenes nuevas, cada oferta trae comentado el `imageHash`
// de una imagen que YA está subida en la cuenta: descomenta esa línea y el
// script no necesita archivo local.

module.exports = {
  clave: 'instituto-justo',
  nombre: 'Instituto Justo',

  cuentaId: '541486784443144',
  pageId: '1145110568691948',
  instagramId: process.env.JUSTO_IG_ID || null,

  // Endulcora manda todo a WhatsApp y es lo que mejor convierte; las campañas
  // viejas de Instituto Justo iban al inbox de Facebook (MESSAGE_PAGE).
  // Si todavía no hay WhatsApp de negocio, pon 'messenger' aquí.
  destino: 'whatsapp',
  // REVISAR: número con lada de país, ej. '525512345678'.
  whatsapp: process.env.JUSTO_WHATSAPP || '',

  etiquetaPeriodo: 'AGO26',

  // $200 MXN al día, que es lo que traía el conjunto de Matemáticas.
  presupuestoDiarioCentavos: 20000,

  sedes: [
    {
      clave: 'coyoacan',
      nombre: 'Coyoacán',
      direccion: 'Plaza Real de Coyoacán, Coyoacán, CDMX',
      latitud: 19.321086,
      longitud: -99.139171,
      // Radio corto: es un instituto presencial, la gente no cruza la ciudad.
      radioKm: 5,
      // 'recent' incluye a quien pasa por la zona (escuelas de alrededor).
      tiposUbicacion: ['home', 'recent'],
    },
  ],

  ofertas: [
    {
      clave: 'regularizacion',
      nombre: 'Regularización',
      empiezaEl: '2026-08-11',
      terminaEl: '2026-09-30',
      // Mamás y papás que ven venir el ciclo escolar.
      publico: { edadMin: 30, edadMax: 55, generos: [2] },
      presupuestoDiarioCentavos: 20000,
      creativo: {
        imagen: 'regularizacion.jpg',
        // Imagen ya subida en la cuenta (Instituto_Justo_Canva_Set 1080x1080):
        // imageHash: 'de3d7f4aa2124ee5dae08438436c69b2',
        encabezado: 'Regularización en Coyoacán',
        texto: [
          'Un niño no reprueba matemáticas por flojo. Reprueba porque se quedó atorado en un tema de hace dos años y nadie se dio cuenta.',
          '',
          'Aquí empezamos por encontrar dónde se rompió la cadena, y de ahí para adelante. Grupos chicos, presencial en Coyoacán, con seguimiento real de cada alumno.',
          '',
          'Plan semanal (6 horas): $800. Plan quincenal (12 horas intensivas): $1,500.',
          '',
          'Escríbenos y te decimos en qué nivel va tu hijo. La primera sesión de diagnóstico de 2 horas cuesta $250.',
        ].join('\n'),
      },
    },

    {
      clave: 'matematicas',
      nombre: 'Clases de Matemáticas',
      empiezaEl: '2026-08-11',
      // Evergreen: sin fecha de fin, se apaga a mano cuando ya no se quiera.
      terminaEl: null,
      publico: { edadMin: 18, edadMax: 45 },
      presupuestoDiarioCentavos: 15000,
      creativo: {
        imagen: 'matematicas.jpg',
        // Imagen ya subida en la cuenta ("Curso de Matemáticas Secundaria y Prepa"):
        // imageHash: '62616f2146a6426b9063ad6ef5d60fea',
        encabezado: 'Clases de matemáticas',
        texto: [
          'No se te dan las matemáticas. Eso te dijeron en la secundaria y te lo creíste.',
          '',
          'Clases particulares y en grupos chicos, presenciales en Coyoacán, para quien va en la escuela, prepara un examen o está retomando estudios que dejó hace años. Sin importar la edad.',
          '',
          'Sesión individual de 2 horas: $300. Plan semanal de 6 horas: $800. Plan quincenal de 12 horas: $1,500.',
          '',
          'Escríbenos: tus primeras 2 horas cuestan $250.',
        ].join('\n'),
      },
    },

    {
      clave: 'admision',
      nombre: 'Examen de Admisión',
      empiezaEl: '2026-08-11',
      terminaEl: '2026-11-30',
      publico: { edadMin: 35, edadMax: 55, generos: [2] },
      presupuestoDiarioCentavos: 15000,
      creativo: {
        imagen: 'admision.jpg',
        // Imagen ya subida en la cuenta (Instituto_Justo_Canva_Set 1080x1080):
        // imageHash: 'f3dc5cd685b5963d9b8e408ab4a648d2',
        encabezado: 'Preparación COMIPEMS',
        texto: [
          'El examen de COMIPEMS no mide qué tanto sabe tu hijo. Mide qué tan rápido resuelve bajo presión.',
          '',
          'Preparación presencial en Coyoacán: temario completo, simulacros cronometrados y estrategia de examen. Empezar en agosto es la diferencia entre la prepa que quiere y la que le toque.',
          '',
          'Plan semanal (6 horas): $800. Plan quincenal (12 horas intensivas): $1,500.',
          '',
          'Escríbenos y te mandamos el diagnóstico gratis con el nivel actual de tu hijo.',
        ].join('\n'),
      },
    },
  ],
};
