// Armado de los mensajes del embudo.
//
// Los textos los escribe el admin en /admin > Bot de ventas. Aqui solo se
// rellenan los {{MARCADORES}} con datos que salen de la base: las fechas del
// calendario y los montos calculados. Esa es toda la diferencia entre un copy
// pegado a mano (que anuncia fechas ya pasadas) y uno que siempre esta al dia.

const store = require('./../store');

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
const DIAS = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO'];

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

function fechaLarga(iso) {
  const d = new Date(`${iso}T12:00:00`);
  return `${DIAS[d.getDay()]} ${d.getDate()} DE ${MESES[d.getMonth()].toUpperCase()}`;
}

// Las fechas vigentes de un taller, agrupadas por dia, en el formato del copy.
function fechasDeTaller(tallerId) {
  const sedes = store.getSedes();
  const porFecha = new Map();

  for (const sede of sedes) {
    for (const sesion of store.getSesionesTaller(sede.id)) {
      if (sesion.tallerBotId !== Number(tallerId)) continue;
      if (sesion.fecha < hoyISO()) continue;
      if (sesion.estado === 'agotado') continue;
      if (!porFecha.has(sesion.fecha)) porFecha.set(sesion.fecha, { horarios: [], sedes: new Set() });
      const entrada = porFecha.get(sesion.fecha);
      if (sesion.horario) entrada.horarios.push(sesion.horario);
      if (sede.nombre) entrada.sedes.add(sede.nombre);
    }
  }

  return [...porFecha.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([fecha, info]) => ({
      fecha,
      horarios: info.horarios,
      sedes: [...info.sedes],
    }));
}

function bloqueFechas(tallerId) {
  const fechas = fechasDeTaller(tallerId);
  if (!fechas.length) return '';
  return fechas
    .map((f) => {
      const horarios = f.horarios.length ? `\n⏰ ${f.horarios.join('   ')}` : '';
      const sedes = f.sedes.length > 1 ? `\n📍 ${f.sedes.join(' / ')}` : '';
      return `🗓 ${fechaLarga(f.fecha)}${horarios}${sedes}`;
    })
    .join('\n\n');
}

function reemplazar(texto, valores) {
  return String(texto || '').replace(/\{\{(\w+)\}\}/g, (coincidencia, clave) => {
    const valor = valores[clave];
    return valor === undefined || valor === null ? '' : String(valor);
  });
}

function pesos(n) {
  return Number(n || 0).toLocaleString('es-MX');
}

/* ---------------------------------------------------------------- */

// Paso 2: el copy del taller, con las fechas reales inyectadas.
function copyTaller(taller) {
  const fechas = bloqueFechas(taller.id);
  return {
    texto: reemplazar(taller.copy, {
      FECHAS: fechas,
      PRECIO: pesos(taller.precioRegular),
      PRECIO_REGULAR: pesos(taller.precioRegular),
      PRECIO_PROMO: pesos(taller.precioPromo),
      ANTICIPO_POR_PERSONA: pesos(store.getBotConfig().anticipoPorPersona),
      TALLER: taller.nombre,
    }),
    hayFechas: !!fechas,
  };
}

// Paso 5: la promo. Los precios son por persona; el multiplicado viene despues.
function copyPromo(taller) {
  const copys = store.getBotCopys();
  const config = store.getBotConfig();
  const anticipo = config.anticipoPorPersona;
  const saldo = Math.max(0, taller.precioPromo - anticipo);
  return reemplazar(copys.promo, {
    TALLER: taller.nombre,
    PRECIO_REGULAR: pesos(taller.precioRegular),
    PRECIO_PROMO: pesos(taller.precioPromo),
    AHORRO: pesos(Math.max(0, taller.precioRegular - taller.precioPromo)),
    ANTICIPO_POR_PERSONA: pesos(anticipo),
    SALDO_POR_PERSONA: pesos(saldo),
  });
}

// La hora limite: tantas horas despues de este momento, redondeada a la media
// hora siguiente para que suene a hora y no a cronometro.
function horaLimite(horas) {
  const limite = new Date(Date.now() + horas * 60 * 60 * 1000);
  limite.setMinutes(limite.getMinutes() > 30 ? 60 : 30, 0, 0);
  return limite.toLocaleTimeString('es-MX', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/Mexico_City',
  }).toUpperCase().replace(/\s+/g, ' ');
}

// Paso 7: el aviso urgente, con el anticipo ya multiplicado por personas.
function copyAvisoUrgente({ taller, personas }) {
  const copys = store.getBotCopys();
  const config = store.getBotConfig();
  const anticipo = config.anticipoPorPersona * personas;
  const total = taller.precioPromo * personas;

  return {
    texto: reemplazar(copys.aviso_urgente, {
      TALLER: taller.nombre,
      PERSONAS: personas,
      DETALLE_PERSONAS: personas > 1 ? ` (por las ${personas} personas)` : '',
      ANTICIPO: pesos(anticipo),
      TOTAL: pesos(total),
      SALDO: pesos(Math.max(0, total - anticipo)),
      HORA_LIMITE: horaLimite(config.horasParaPagar),
    }),
    anticipo,
    total,
    saldo: Math.max(0, total - anticipo),
    limite: new Date(Date.now() + config.horasParaPagar * 60 * 60 * 1000),
  };
}

module.exports = {
  copyTaller,
  copyPromo,
  copyAvisoUrgente,
  bloqueFechas,
  fechasDeTaller,
  horaLimite,
};
