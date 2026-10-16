// Lee el calendario fisico de talleres (un Excel en Drive, con un bloque
// visual por sede y mes: "[MES] Sucursal X", una fila de dias de la semana,
// y debajo filas de numeros de dia con los talleres de esa semana) y da de
// alta en el sitio los talleres nuevos que encuentra — nunca borra ni
// modifica uno que ya existe (ver store.importarSesionesTaller).
//
// El archivo real tiene MUCHAS pestañas: una por año (2021, 2022... el año
// en curso, con historial de años pasados), mas "Ideas", "Lista Blanca",
// "MES ACTUAL" (sin usar), "RESUBIDAS", "Lista Negra" que no son
// calendarios vigentes. Confirmado con el dueño del sitio: la pestaña que
// siempre importa es la del AÑO EN CURSO (ej. "2026"), asi que es la unica
// que se lee en automatico — se calcula sola segun la fecha de hoy, no hay
// que tocar el codigo cuando cambie el año.
//
// Dentro de esa pestaña tambien hay meses ya pasados de este mismo año
// (enero, febrero...) — esos se leen igual (el año ya es explicito, el
// nombre de la pestaña) pero se descartan antes de importar, para no
// llenar el calendario de talleres que ya pasaron cada vez que sincroniza.
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

// El calendario no trae año dentro de cada bloque de mes: se usa el año de
// la pestaña misma (ej. pestaña "2026" -> todo lo que traiga es del 2026).
// Si alguna vez se lee una pestaña cuyo nombre no es un año de 4 digitos,
// se asume el proximo en que cae ese mes (respaldo, no deberia pasar en el
// flujo automatico ya que leerCalendarioFisico solo pide la del año actual).
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
// de dias, de izquierda a derecha sin bajar (lunes <= martes <= ... etc) —
// salvo que la semana cruce de un mes a otro (ej. 26,27,28,29,30,31,1), que
// es la UNICA bajada que se acepta: del 25 en adelante a un numero del 1 al
// 7. Sin esto, esa fila de fin de mes no se reconocia como fila de dias y
// sus celdas se leian como si fueran nombres de talleres (de ahi salian
// talleres fantasma con un numero suelto como titulo, ej. "26", "27"...).
function detectarNumerosDeDia(fila, columnas) {
  const valores = columnas.map((idx) => {
    const v = String((fila || [])[idx] || '').trim();
    return /^\d{1,2}$/.test(v) ? Number(v) : null;
  });
  const conValor = valores.filter((v) => v !== null);
  if (!conValor.length || conValor.some((v) => v < 1 || v > 31)) return null;
  for (let i = 1; i < conValor.length; i++) {
    if (conValor[i] < conValor[i - 1] && !(conValor[i - 1] >= 25 && conValor[i] <= 7)) {
      return null; // no es una fila de dias reales
    }
  }
  return valores;
}

// A partir de los numeros de dia de una fila (que ya puede traer un cruce
// de mes, ver detectarNumerosDeDia) arma la fecha completa {dia, mesNumero,
// anio} de cada columna. Un "bajon" dentro de la fila (ej. ...30,1...)
// cambia de mes, pero el sentido del cambio depende de si es la PRIMERA
// fila de dias de la seccion:
// - Primera fila: la semana puede arrancar con la cola del mes ANTERIOR
//   (ej. "[OCTUBRE]" pero la fila trae 28,29,30 de septiembre antes del
//   1 de octubre) — lo de antes del bajon es el mes anterior, lo de
//   despues es el mes de la seccion.
// - Cualquier otra fila: es el fin de mes de siempre (ej. 26..31,1) — lo
//   de antes del bajon es el mes de la seccion, lo de despues es el que
//   entra.
// Sin esta distincion, la cola de septiembre se etiquetaba como octubre y
// el bajon se interpretaba siempre "hacia adelante", corriendo esos dias
// un mes completo (por eso "Masa Madre" del 1 de octubre aparecia el 1 de
// noviembre).
function construirFechasFila(valores, mesSeccion, anioSeccion, esPrimeraFila) {
  const idxConValor = [];
  valores.forEach((v, i) => { if (v !== null) idxConValor.push(i); });
  let idxBajon = -1;
  for (let k = 1; k < idxConValor.length; k++) {
    if (valores[idxConValor[k]] < valores[idxConValor[k - 1]]) { idxBajon = idxConValor[k]; break; }
  }

  function mesAnioPara(i) {
    if (idxBajon === -1) return { mes: mesSeccion, anio: anioSeccion };
    if (esPrimeraFila) {
      if (i < idxBajon) {
        let mes = mesSeccion - 1;
        let anio = anioSeccion;
        if (mes < 1) { mes = 12; anio -= 1; }
        return { mes, anio };
      }
      return { mes: mesSeccion, anio: anioSeccion };
    }
    if (i < idxBajon) return { mes: mesSeccion, anio: anioSeccion };
    let mes = mesSeccion + 1;
    let anio = anioSeccion;
    if (mes > 12) { mes = 1; anio += 1; }
    return { mes, anio };
  }

  return valores.map((dia, i) => {
    if (dia === null) return null;
    const { mes, anio } = mesAnioPara(i);
    return { dia, mesNumero: mes, anio };
  });
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
// /admin, nunca en silencio). `nombreHoja` se usa como año explicito si es
// de 4 digitos (ej. "2026"); si no, se adivina con anioParaMes.
function interpretarCuadricula(filas2D, nombreHoja) {
  const encontradas = [];
  const avisos = [];
  let seccionActual = null;
  let columnasDias = null;
  let diasSemanaActual = null;
  let primeraFilaDeDiasPendiente = false;
  const anioPestana = /^\d{4}$/.test(String(nombreHoja || '').trim()) ? Number(nombreHoja) : null;

  (filas2D || []).forEach((fila) => {
    if (!fila || !fila.length) return;

    for (const celda of fila) {
      const seccion = extraerSeccion(celda);
      if (seccion) {
        seccionActual = { ...seccion, anio: anioPestana || anioParaMes(seccion.mesNumero) };
        columnasDias = null;
        diasSemanaActual = null;
        primeraFilaDeDiasPendiente = true;
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
      diasSemanaActual = construirFechasFila(numeros, seccionActual.mesNumero, seccionActual.anio, primeraFilaDeDiasPendiente);
      primeraFilaDeDiasPendiente = false;
      return;
    }
    if (!diasSemanaActual) return;

    columnasDias.forEach((idxCol, posDia) => {
      const info = diasSemanaActual[posDia];
      if (!info) return;
      const crudo = fila[idxCol];
      if (!crudo || !String(crudo).trim()) return;
      const { titulo, horario } = extraerHorarioYTitulo(crudo);
      if (!titulo) return;
      const fecha = `${info.anio}-${String(info.mesNumero).padStart(2, '0')}-${String(info.dia).padStart(2, '0')}`;
      encontradas.push({ sede: seccionActual.sede, fecha, titulo, horario });
    });
  });

  if (!encontradas.length) {
    avisos.push(`La pestaña "${nombreHoja}" no trajo ningún taller reconocible (puede ser una pestaña que no es un calendario, ej. notas o ideas).`);
  }
  return { filas: encontradas, avisos };
}

// Lee SOLO la pestaña del año en curso (ej. "2026") del calendario fisico
// (ver nota arriba de por que no se leen las demas) y la interpreta.
async function leerCalendarioFisico() {
  const spreadsheetId = GOOGLE_SHEETS.calendarioFisicoId;
  const hojas = await googleSheets.listarHojas(spreadsheetId);
  const avisos = [];
  const pestana = String(new Date().getFullYear());
  if (!hojas.includes(pestana)) {
    avisos.push(`No se encontró la pestaña "${pestana}" (el año en curso) en el calendario físico — no se sincronizó nada.`);
    return { filas: [], avisos, hojas };
  }
  let filas = [];
  try {
    const cuadricula = await googleSheets.leerCuadricula(pestana, spreadsheetId);
    const resultado = interpretarCuadricula(cuadricula, pestana);
    filas = resultado.filas;
    avisos.push(...resultado.avisos);
  } catch (e) {
    avisos.push(`No se pudo leer la pestaña "${pestana}": ${e.message}`);
  }
  return { filas, avisos, hojas };
}

// Lee el calendario fisico y da de alta los talleres nuevos. Nunca truena
// hacia afuera: regresa { creadas, saltadas, errores, avisos } siempre,
// incluso si Sheets no esta configurado (en ese caso, con creadas=0).
// Descarta fechas ya pasadas antes de importar — la pestaña del año trae
// tambien los meses que ya se dieron, y no tiene caso llenar el calendario
// con talleres viejos cada vez que corre el barrido de 30 minutos.
async function sincronizarCalendarioFisico() {
  if (!googleSheets.configurado()) {
    return { creadas: 0, saltadas: 0, errores: [], avisos: [`Google Sheets no esta configurado: ${googleSheets.faltantes().join(', ')}.`] };
  }
  const { filas, avisos } = await leerCalendarioFisico();
  const hoyISO = new Date().toISOString().slice(0, 10);
  const filasFuturas = filas.filter((f) => f.fecha >= hoyISO);
  const contenido = store.getContent();
  const resultado = store.importarSesionesTaller(filasFuturas, {
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
