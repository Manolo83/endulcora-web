'use strict';

// Cuenta de referencia: esto es lo que ya corre en Meta para Endulcora y de
// donde salió el machote. Sirve para dos cosas:
//   1. Documentar la estructura que funciona.
//   2. Poder relanzar los talleres del mes con `node ads/publicar.js endulcora`.
//
// Los datos (cuenta, página, coordenadas de las sedes, presupuesto, edades)
// están copiados de las campañas activas de agosto 2026.

module.exports = {
  clave: 'endulcora',
  nombre: 'Endulcora · Estudio Gastronómico',

  cuentaId: '75151654',
  pageId: '605291926236098',
  instagramId: process.env.ENDULCORA_IG_ID || null,

  // Todas las campañas mandan a WhatsApp con CTA "Enviar mensaje de WhatsApp".
  destino: 'whatsapp',
  whatsapp: process.env.ENDULCORA_WHATSAPP || '',

  // Prefijo de los nombres de campaña: "AGO26 · Moles · Nativitas".
  etiquetaPeriodo: 'AGO26',

  // $150 MXN al día por taller (en centavos).
  presupuestoDiarioCentavos: 15000,

  sedes: [
    {
      clave: 'nativitas',
      nombre: 'Nativitas',
      direccion: 'Calle Antonio Rodríguez 34, Col. San Simón Ticumac, CDMX',
      latitud: 19.37585,
      longitud: -99.14182,
      radioKm: 7,
    },
    {
      clave: 'division',
      nombre: 'División',
      direccion: 'Av. División del Norte 3651, San Pablo Tepetlapa, Coyoacán, 04620 CDMX',
      latitud: 19.32292,
      longitud: -99.13935,
      radioKm: 7,
    },
  ],

  // Un ejemplo real, con el tono y la estructura de copy que se usa:
  // gancho -> qué te llevas -> formato -> llamada con anticipo.
  ofertas: [
    {
      clave: 'postres-nogada',
      nombre: 'Postres con Nogada',
      sedes: ['nativitas', 'division'],
      empiezaEl: '2026-08-10',
      fechaEvento: '2026-08-27',
      publico: { edadMin: 25, edadMax: 55 },
      creativo: {
        imagen: 'postres-nogada.jpg',
        encabezado: 'wa.me',
        texto: [
          'Todos venden chiles en nogada. Nadie vende postres de nogada.',
          '',
          'Panqué, panna cotta y cheesecake con nogada auténtica de nuez de Castilla. Un producto de temporada que no está en ninguna otra carta de la ciudad.',
          '',
          'Taller presencial de 4 horas. Para principiantes. Te llevas tus tres postres.',
          '',
          'Escríbenos y aparta tu lugar con $400.',
        ].join('\n'),
      },
    },
  ],
};
