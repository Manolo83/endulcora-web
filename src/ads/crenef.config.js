// Datos de Crenef para armar sus campañas de Meta Ads.
//
// Este es el ÚNICO archivo que tienes que editar para lanzar. La receta (cómo se
// arma cada campaña, conjunto y anuncio) ya está resuelta en machote.js y es la
// misma que hoy corre en Endulcora.
//
// Todo lo que dice PENDIENTE hay que llenarlo antes de crear nada: son datos del
// negocio que el script no puede adivinar. `npm run ads:crenef` te avisa si falta
// alguno en vez de mandar basura a Meta.

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
  // (Configuración > Cuentas publicitarias > Agregar activos) o los anuncios no
  // se van a entregar.
  cuentaPublicitariaId: PENDIENTE,

  // Número al que llegan los mensajes de los anuncios, con lada de país y sin
  // signos: 52 + 10 dígitos. Ejemplo: '525512345678'.
  whatsapp: PENDIENTE,

  // Cuánto gasta al día cada conjunto de anuncios, en pesos. Endulcora usa $150.
  presupuestoDiarioMxn: 150,

  // Las sucursales/sedes. Cada taller se publica una vez por cada sede que
  // elijas, con un radio de 7 km alrededor de la dirección.
  sedes: {
    // Ejemplo con la forma exacta que necesita cada sede. Duplica el bloque por
    // cada sucursal y borra este comentario cuando lo llenes.
    principal: {
      nombre: PENDIENTE, // como sale en el nombre de la campaña, ej. 'Nativitas'
      direccion: PENDIENTE, // dirección completa, la usa Meta para el radio
      latitud: PENDIENTE,
      longitud: PENDIENTE,
      // Página de Facebook de Crenef. Este id ya está verificado.
      paginaId: '112678221416248',
      // Cuenta de Instagram ligada, para que el anuncio también salga ahí.
      // Déjala en null si no hay: el anuncio corre solo en Facebook/WhatsApp.
      instagramId: null,
    },
  },

  // Los talleres o servicios que se van a anunciar.
  //
  // Cada uno genera 1 campaña por sede. `copy` sigue la fórmula de Endulcora:
  // gancho, qué te llevas, formato, y cierre con la acción y el anticipo.
  // `imagen` es la ruta a un archivo JPG/PNG dentro del repo o del disco.
  // `ubicaciones` es 'automaticas' (Advantage+, para imagen cuadrada) o
  // 'verticales' (solo historias y reels, para creativos 9:16).
  talleres: [
    {
      nombre: PENDIENTE, // ej. 'Panadería Mexicana'
      sedes: ['principal'],
      inicio: fecha('2026-01-01 15:00'), // cuándo empieza a correr el anuncio
      fin: fecha('2026-01-01 20:00'), // cuándo deja de correr (día del taller)
      imagen: PENDIENTE,
      ubicaciones: 'automaticas',
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

  const sedes = Object.entries(config.sedes || {});
  if (!sedes.length) problemas.push('No hay ninguna sede en `sedes`.');

  for (const [clave, sede] of sedes) {
    for (const campo of ['nombre', 'direccion', 'latitud', 'longitud', 'paginaId']) {
      if (falta(sede[campo])) problemas.push(`Sede "${clave}": falta \`${campo}\`.`);
    }
  }

  const talleres = config.talleres || [];
  if (!talleres.length) problemas.push('No hay ningún taller en `talleres`.');

  talleres.forEach((taller, i) => {
    const etiqueta = taller.nombre || `#${i + 1}`;
    for (const campo of ['nombre', 'imagen', 'copy']) {
      if (falta(taller[campo])) problemas.push(`Taller "${etiqueta}": falta \`${campo}\`.`);
    }
    if (!(taller.sedes || []).length) {
      problemas.push(`Taller "${etiqueta}": no tiene sedes asignadas.`);
    }
    for (const clave of taller.sedes || []) {
      if (!config.sedes || !config.sedes[clave]) {
        problemas.push(`Taller "${etiqueta}": la sede "${clave}" no existe en \`sedes\`.`);
      }
    }
    if (taller.fin && taller.inicio && taller.fin <= taller.inicio) {
      problemas.push(`Taller "${etiqueta}": \`fin\` debe ser posterior a \`inicio\`.`);
    }
  });

  return problemas;
}

module.exports = { CRENEF, revisarConfig };
