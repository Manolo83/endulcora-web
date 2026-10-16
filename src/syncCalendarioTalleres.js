// Lee el calendario fisico de talleres (un Excel en Drive, con un bloque
// visual por sede y mes: "[MES] Sucursal X", una fila de dias de la semana,
// y debajo filas de numeros de dia con los talleres de esa semana) y da de
// alta en el sitio los talleres nuevos que encuentra — nunca borra ni
// modifica uno que ya existe (ver store.importarSesionesTaller).
//
// El archivo real tiene MUCHAS pestañas: una por año (2021...2026, con
// historial ya pasado), mas "Ideas", "Lista Blanca", "RESUBIDAS", "Lista
// Negra" que no son calendarios. Solo la pestaña "MES ACTUAL" (confirmado
// con el dueño del sitio) se mantiene siempre con lo vigente/por venir —
// por eso es la UNICA que se lee en automatico. Leer las de años viejos
// crearia talleres falsos (un mes ya pasado sin año se interpreta como "la
// proxima vez que caiga ese mes", es decir el año que entra).
//
// Es "mejor esfuerzo" a proposito: la hoja la edita una persona a mano, sin
// ninguna estructura rigida de columnas, asi que el analisis puede fallar
// si cambia mucho el formato. Por eso nunca se arriesga a borrar nada —
// en el peor caso, un mes no se lee bien y se importa a mano con la
// herramienta de "Importar calendario de un mes" (misma funcion por
// debajo, store.importarSesionesTaller).
const store = require('./store');
const googleSheets = require('./googleSheets');
const { GOOGLE_SHEETS } = require('./config');

const PESTAÑA_VIGENTE = 'MES ACTUAL';

const MESES = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7,
  agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};
const DIAS_SEMANA = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];

// Alias conocidos: el calendario fisico a veces usa un nombre corto
// ("Division") distinto al nombre completo ya dado de alta en el sitio
// ("División del Norte") — sin esto, se crearia una sede duplicada.
const ALIAS_SEDE = {
  division: 'División del Norte',
  nativitas: 'Nativitas',
};

function normalizar(s) {
  return String(s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function resolverNombreSede(nombreCrudo) {
  return ALIAS_SEDE[normalizar(nombreCrudo)] || String(nombreCrudo || '').trim();
}

// El calendario no trae año: se asume el proximo en que cae ese mes (si ya
// pasó este año, es del año que entra).
function anioParaMes(mesNumero) {
  const hoy = new Date();
  const mesActual = hoy.getMonth() + 1;
  return mesNumero >= mesActual ? hoy.getFullYear() : hoy.getFullYear() + 1;
}

// "[NOVIEMBRE] Sucursal Nativitas" -> { mesNumero: 11, sede: 'Nativitas' }
function extraerSeccion(celda) {
  const m = String(celda || '').match(/\[?\s*([a-zñáéíóú]+)\s*\]?\s*sucursal\s+(.+)/i);
  if (!m) return null;
  const mesNumero = MESES[normalizar(m[1])];
  if (!mesNumero) return null;
  return { mesNumero, sede: resolverNombreSede(m[2]) };
}

// Busca "Lunes, Martes, ... Domingo" en 7 columnas consecutivas; regresa
// sus indices de columna, o null si esta fila no es ese encabezado.
function detectarColumnasDias(fila) {
  const normalizadas = (fila || []).map(normalizar);
  for (let i = 0; i < normalizadas.length; i++) {
    if (normalizadas[i] !== DIAS_SEMANA[0]) continue;
    const columnas = [i];
    let ok = true;
    for (let d = 1; d < 7; d++) {
      if (normalizadas[i + d] !== DIAS_SEMANA[d]) { ok = false; break; }
      columnas.push(i + d);
    }
    if (ok) return columnas;
  }
  return null;
}

// Una fila "de semana" trae el numero del dia en algunas de las 7 columnas
// de dias, de izquierda a derecha sin bajar (lunes <= martes <= ... etc).
function detectarNumerosDeDia(fila, columnas) {
  const valores = columnas.map((idx) => {
    const v = String((fila || [])[idx] || '').trim();
    return /^\d{1,2}$/.test(v) ? Number(v) : null;
  });
  const conValor = valores.filter((v) => v !== null);
  if (!conValor.length || conValor.some((v) => v < 1 || v > 31)) return null;
  for (let i = 1; i < conValor.length; i++) {
    if (conValor[i] < conValor[i - 1]) return null; // no es una fila de dias reales
  }
  return valores;
}

// "Tablas Charcutería 4pm" -> { titulo: 'Tablas Charcutería', horario: 'tarde' }
function extraerHorarioYTitulo(textoCrudo) {
  const texto = String(textoCrudo || '').trim();
  const m = texto.match(/^(.*?)\s*-?\s*4(:00)?\s*pm\s*$/i);
  if (m && m[1].trim()) return { titulo: m[1].trim(), horario: 'tarde' };
  return { titulo: texto, horario: 'manana' };
}

// Interpreta una pestaña completa (matriz de filas x columnas, como la
// regresa Google Sheets) y regresa las filas {sede, fecha, titulo, horario}
// que encontro, mas avisos de lo que no pudo interpretar (para mostrar en
// /admin, nunca en silencio).
function interpretarCuadricula(filas2D, nombreHoja) {
  const encontradas = [];
  const avisos = [];
  let seccionActual = null;
  let columnasDias = null;
  let diasSemanaActual = null;

  (filas2D || []).forEach((fila) => {
    if (!fila || !fila.length) return;

    for (const celda of fila) {
      const seccion = extraerSeccion(celda);
      if (seccion) {
        seccionActual = { ...seccion, anio: anioParaMes(seccion.mesNumero) };
        columnasDias = null;
        diasSemanaActual = null;
        break;
      }
    }
    if (!seccionActual) return;

    const columnasEncontradas = detectarColumnasDias(fila);
    if (columnasEncontradas) {
      columnasDias = columnasEncontradas;
      diasSemanaActual = null;
      return;
    }
    if (!columnasDias) return;

    const numeros = detectarNumerosDeDia(fila, columnasDias);
    if (numeros) {
      diasSemanaActual = numeros;
      return;
    }
    if (!diasSemanaActual) return;

    columnasDias.forEach((idxCol, posDia) => {
      const diaNumero = diasSemanaActual[posDia];
      if (!diaNumero) return;
      const crudo = fila[idxCol];
      if (!crudo || !String(crudo).trim()) return;
      const { titulo, horario } = extraerHorarioYTitulo(crudo);
      if (!titulo) return;
      const fecha = `${seccionActual.anio}-${String(seccionActual.mesNumero).padStart(2, '0')}-${String(diaNumero).padStart(2, '0')}`;
      encontradas.push({ sede: seccionActual.sede, fecha, titulo, horario });
    });
  });

  if (!encontradas.length) {
    avisos.push(`La pestaña "${nombreHoja}" no trajo ningún taller reconocible (puede ser una pestaña que no es un calendario, ej. notas o ideas).`);
  }
  return { filas: encontradas, avisos };
}

// Lee SOLO la pestaña "MES ACTUAL" del calendario fisico (ver nota arriba
// de por que no se leen las demas) y la interpreta.
async function leerCalendarioFisico() {
  const spreadsheetId = GOOGLE_SHEETS.calendarioFisicoId;
  const hojas = await googleSheets.listarHojas(spreadsheetId);
  const avisos = [];
  if (!hojas.includes(PESTAÑA_VIGENTE)) {
    avisos.push(`No se encontró la pestaña "${PESTAÑA_VIGENTE}" en el calendario físico — no se sincronizó nada.`);
    return { filas: [], avisos, hojas };
  }
  let filas = [];
  try {
    const cuadricula = await googleSheets.leerCuadricula(PESTAÑA_VIGENTE, spreadsheetId);
    const resultado = interpretarCuadricula(cuadricula, PESTAÑA_VIGENTE);
    filas = resultado.filas;
    avisos.push(...resultado.avisos);
  } catch (e) {
    avisos.push(`No se pudo leer la pestaña "${PESTAÑA_VIGENTE}": ${e.message}`);
  }
  return { filas, avisos, hojas };
}

// Lee el calendario fisico y da de alta los talleres nuevos. Nunca truena
// hacia afuera: regresa { creadas, saltadas, errores, avisos } siempre,
// incluso si Sheets no esta configurado (en ese caso, con creadas=0).
async function sincronizarCalendarioFisico() {
  if (!googleSheets.configurado()) {
    return { creadas: 0, saltadas: 0, errores: [], avisos: [`Google Sheets no esta configurado: ${googleSheets.faltantes().join(', ')}.`] };
  }
  const { filas, avisos } = await leerCalendarioFisico();
  const contenido = store.getContent();
  const resultado = store.importarSesionesTaller(filas, {
    precioTotal: contenido.taller_precio_default,
    anticipo: contenido.taller_anticipo_default,
    cupoMaximo: contenido.taller_cupo_default,
  });
  return {
    creadas: resultado.creadas.length,
    saltadas: resultado.saltadas.length,
    errores: resultado.errores,
    avisos,
  };
}

module.exports = {
  sincronizarCalendarioFisico,
  leerCalendarioFisico,
  interpretarCuadricula, // exportado para poder probarlo directo
};
