// Datos de Crenef para armar sus campañas de Meta Ads.
//
// Este es el ÚNICO archivo que tienes que editar. La receta (cómo se arma cada
// campaña, conjunto y anuncio) ya está resuelta en machote.js.
//
// Todo lo que dice PENDIENTE hay que llenarlo antes de crear nada. `npm run
// ads:crenef` te dice exactamente qué falta en vez de mandar algo incompleto
// a Meta.
//
// ANTES DE ESCRIBIR LOS COPYS, lee politicas-salud.js. En resumen: nunca le
// digas a quien ve el anuncio lo que tiene. "¿Sufres de ansiedad?" lo rechazan;
// "Atendemos ansiedad" no. El script revisa esto solo y te avisa.

const { fecha } = require('./machote');

const PENDIENTE = null;

const CRENEF = {
  marca: 'Crenef',

  // Cuenta publicitaria donde se crean las campañas (el número, sin "act_").
  //
  // Ojo antes de elegir: la cuenta 376340486445864 está vacía pero NO tiene
  // método de pago ni la página de Crenef ligada, y la 541486784443144 (donde
  // corren las campañas de matemáticas) tampoco tiene ligada la página de
  // Crenef. Cualquiera de las dos hay que arreglarla en Business Manager
  // (Configuración del negocio > Cuentas publicitarias > Agregar activos) o los
  // anuncios no se van a entregar.
  cuentaPublicitariaId: PENDIENTE,

  // Número al que llegan los mensajes, con lada de país y sin signos:
  // 52 + 10 dígitos. Ejemplo: '525512345678'.
  whatsapp: PENDIENTE,

  // Cuánto gasta al día cada conjunto de anuncios, en pesos.
  presupuestoDiarioMxn: 150,

  // Las sucursales o consultorios. Cada terapia se publica una vez por cada
  // sucursal que le asignes, con un radio alrededor de la dirección.
  sucursales: {
    // Duplica este bloque por cada consultorio. La llave ('principal') es solo
    // para referirte a él desde `terapias`.
    principal: {
      nombre: PENDIENTE, // como sale en el nombre de la campaña, ej. 'Narvarte'
      direccion: PENDIENTE, // dirección completa, la usa Meta para el radio
      latitud: PENDIENTE,
      longitud: PENDIENTE,
      // Página de Facebook de Crenef. Este id ya está verificado.
      paginaId: '112678221416248',
      // Cuenta de Instagram ligada, para que el anuncio también salga ahí.
      // Déjala en null si no hay: corre solo en Facebook y WhatsApp.
      instagramId: null,
      // Opcional: radio en km solo para esta sucursal. Si no lo pones, usa 10.
      // Súbelo si la clínica está en una zona de baja densidad.
      radioKm: null,
    },
  },

  // Las terapias o servicios que se van a anunciar. Cada una genera 1 campaña
  // por sucursal.
  //
  // `edadMin`/`edadMax` importan más que en cualquier otro negocio: una terapia
  // infantil le habla a los papás (28 a 50), no a los niños; una de adultos
  // mayores le habla a los hijos o al paciente (45 a 65). Si los dejas en null
  // usa 25 a 65, que es demasiado amplio para casi todo.
  //
  // `fin` casi siempre va en null: una terapia es un servicio permanente y el
  // anuncio no debe morirse solo. Ponle fecha únicamente si es una promoción
  // o una campaña de temporada.
  terapias: [
    {
      nombre: PENDIENTE, // ej. 'Terapia de Lenguaje'
      sucursales: ['principal'],
      inicio: fecha('2026-01-01 08:00'), // cuándo empieza a correr el anuncio
      fin: null, // null = permanente
      edadMin: PENDIENTE,
      edadMax: PENDIENTE,
      imagen: PENDIENTE, // ruta a un JPG/PNG, ej. 'public/ads/lenguaje.jpg'
      ubicaciones: 'automaticas', // o 'verticales' si el creativo es 9:16
      // Con qué texto llega el paciente a WhatsApp. Deja que la recepción sepa
      // de qué anuncio viene sin preguntar.
      mensajeInicial: PENDIENTE, // ej. 'Hola, quiero información de terapia de lenguaje'
      // Los 4 bloques: qué atiende / cómo es la sesión / quién la da / el
      // siguiente paso. Siempre en tercera persona.
      copy: PENDIENTE,
    },
  ],
};

// Revisa que no quede ningún PENDIENTE y que los datos tengan la forma correcta.
// Devuelve la lista de problemas; vacía significa que se puede lanzar.
function revisarConfig(config = CRENEF) {
  const problemas = [];
  const falta = (valor) => valor === null || valor === undefined || valor === '';

  if (falta(config.cuentaPublicitariaId)) problemas.push('Falta `cuentaPublicitariaId`.');
  if (falta(config.whatsapp)) {
    problemas.push('Falta `whatsapp`.');
  } else if (!/^\d{11,15}$/.test(String(config.whatsapp))) {
    problemas.push('`whatsapp` debe ser solo dígitos con lada de país, ej. 525512345678.');
  }

  const sucursales = Object.entries(config.sucursales || {});
  if (!sucursales.length) problemas.push('No hay ninguna sucursal en `sucursales`.');

  for (const [clave, sucursal] of sucursales) {
    for (const campo of ['nombre', 'direccion', 'latitud', 'longitud', 'paginaId']) {
      if (falta(sucursal[campo])) problemas.push(`Sucursal "${clave}": falta \`${campo}\`.`);
    }
  }

  const terapias = config.terapias || [];
  if (!terapias.length) problemas.push('No hay ninguna terapia en `terapias`.');

  terapias.forEach((terapia, i) => {
    const etiqueta = terapia.nombre || `#${i + 1}`;
    for (const campo of ['nombre', 'imagen', 'copy']) {
      if (falta(terapia[campo])) problemas.push(`Terapia "${etiqueta}": falta \`${campo}\`.`);
    }
    if (!(terapia.sucursales || []).length) {
      problemas.push(`Terapia "${etiqueta}": no tiene sucursales asignadas.`);
    }
    for (const clave of terapia.sucursales || []) {
      if (!config.sucursales || !config.sucursales[clave]) {
        problemas.push(`Terapia "${etiqueta}": la sucursal "${clave}" no existe en \`sucursales\`.`);
      }
    }
    if (terapia.fin && terapia.inicio && terapia.fin <= terapia.inicio) {
      problemas.push(`Terapia "${etiqueta}": \`fin\` debe ser posterior a \`inicio\`.`);
    }
    const { edadMin, edadMax } = terapia;
    if (!falta(edadMin) && !falta(edadMax) && Number(edadMin) > Number(edadMax)) {
      problemas.push(`Terapia "${etiqueta}": \`edadMin\` no puede ser mayor que \`edadMax\`.`);
    }
    if (!falta(edadMin) && Number(edadMin) < 18) {
      // Meta no deja segmentar a menores de 18 en la mayoría de los casos, y en
      // salud el anuncio le habla al adulto que agenda la cita.
      problemas.push(`Terapia "${etiqueta}": \`edadMin\` no puede ser menor a 18. El anuncio le habla a quien agenda, no al paciente.`);
    }
  });

  return problemas;
}

module.exports = { CRENEF, revisarConfig };
