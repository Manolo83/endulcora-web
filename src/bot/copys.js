// Armado de los mensajes que manda el bot al contestar comentarios.
//
// Los textos los escribe el admin en /admin > Bot de comentarios. Aqui solo se
// rellenan los {{MARCADORES}} con datos que salen de la base: las fechas del
// calendario y el WhatsApp de atencion. Esa es toda la diferencia entre un copy
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
  // El mismo formato que usa el equipo de ventas: la fecha con su sucursal en
  // una linea y el horario debajo.
  return fechas
    .map((f) => {
      const sedes = f.sedes.length ? ` — Sucursal ${f.sedes.join(' y ')}` : '';
      const horarios = f.horarios.length ? `\n⏰ ${f.horarios.join('   ')}` : '';
      return `🗓️ *${fechaLarga(f.fecha)}*${sedes}${horarios}`;
    })
    .join('\n');
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

// El copy del taller, con las fechas reales inyectadas. El bot lo lee para
// contestar dudas concretas; nunca lo pega completo en un comentario.
function copyTaller(taller) {
  const fechas = bloqueFechas(taller.id);
  return {
    texto: reemplazar(taller.copy, {
      FECHAS: fechas,
      PRECIO: pesos(taller.precioRegular),
      PRECIO_REGULAR: pesos(taller.precioRegular),
      PRECIO_PROMO: pesos(taller.precioPromo),
      // Con cuanto se reserva. El bot solo lo informa: el apartado lo cobra
      // una persona por WhatsApp.
      ANTICIPO_REGULAR: pesos(store.getBotConfig().anticipoRegular),
      TALLER: taller.nombre,
    }),
    hayFechas: !!fechas,
  };
}

/* ---- Los mensajes del comentario ---- */
//
// El bot no atiende WhatsApp: lo reparte. Cada respuesta a un comentario
// termina mandando a la persona al numero de siempre, donde la atiende alguien
// de Endulcora. Por eso la liga la pone el codigo y no el modelo: asi nunca
// sale mal escrita ni apunta a un numero viejo.

// "5215665271901" -> "56 6527 1901": como lo escribiria cualquiera en Mexico.
function telefonoLegible(digitos) {
  const limpio = String(digitos || '').replace(/\D/g, '');
  const nacional = limpio.replace(/^52(1)?/, '');
  if (nacional.length !== 10) return limpio;
  return `${nacional.slice(0, 2)} ${nacional.slice(2, 6)} ${nacional.slice(6)}`;
}

// Rellena la liga y el numero legible. Sin numero configurado se quitan las
// lineas que los mencionan, en vez de mandar un "https://wa.me/" roto; y con
// ellas se va la linea que las presentaba ("Escríbenos por WhatsApp:"), que
// sola no dice nada.
function conNumero(copy) {
  const digitos = String(store.getBotConfig().whatsappAtencion || '').replace(/\D/g, '');
  const texto = String(copy || '');

  if (!digitos) {
    const lineas = texto.split('\n');
    const fuera = new Set();
    lineas.forEach((linea, i) => {
      if (!/\{\{(LIGA_WHATSAPP|WHATSAPP_ATENCION)\}\}/.test(linea)) return;
      fuera.add(i);
      for (let j = i - 1; j >= 0 && !fuera.has(j); j--) {
        if (!lineas[j].trim()) continue;
        if (lineas[j].trim().endsWith(':')) fuera.add(j);
        break;
      }
    });
    return lineas
      .filter((_, i) => !fuera.has(i))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  return texto
    .replace(/\{\{LIGA_WHATSAPP\}\}/g, `https://wa.me/${digitos}`)
    .replace(/\{\{WHATSAPP_ATENCION\}\}/g, telefonoLegible(digitos));
}

// Lo que se deja debajo del comentario, a la vista de todos. Cambia segun si el
// mensaje privado si salio: prometer en publico un privado que nunca llego es
// peor que no prometer nada.
function copyComentarioPublico(privadoEnviado = true) {
  const copys = store.getBotCopys();
  const texto = privadoEnviado
    ? copys.comentario_publico
    : copys.comentario_publico_sin_privado || copys.comentario_publico;
  return conNumero(texto);
}

// El mensaje privado completo: saludo de la marca, la respuesta que redacto el
// modelo, y el cierre con la liga. Si el modelo no logro contestar, el saludo y
// el cierre solos siguen siendo un mensaje util.
function copyComentarioPrivado(respuesta) {
  const copys = store.getBotCopys();
  return [conNumero(copys.comentario_privado), String(respuesta || '').trim(), conNumero(copys.comentario_cierre)]
    .filter((p) => p)
    .join('\n\n');
}

module.exports = {
  copyTaller,
  copyComentarioPublico,
  copyComentarioPrivado,
  telefonoLegible,
  bloqueFechas,
  fechasDeTaller,
  hoyISO,
};
