'use strict';

// De donde llego una persona, leido de los ids de clic que trae su navegador
// y que se guardan junto al pedido o a la inscripcion.
//
// Lo unico que PRUEBA que vino de un anuncio es el id de clic: Meta escribe
// la cookie _fbc nada mas cuando alguien le dio clic a un anuncio, y
// gclid/gbraid/wbraid hacen lo mismo del lado de Google.
//
// Ojo con _fbp: NO es un origen. El pixel lo pone en cualquier visita, venga
// de un anuncio o no. Aqui sirve para una sola cosa, separar dos casos que de
// otra forma se verian igual: si _fbp esta guardado y no hay id de clic,
// entonces si capturamos las cookies y no hubo anuncio (llego directo de
// verdad); si no hay ni _fbp, no capturamos nada y no sabemos.

// Hasta esta fecha, ni la pagina del taller ni el formulario de inscripcion
// mandaban las cookies al servidor, asi que de los registros anteriores no se
// puede saber el origen: no es que no hubiera anuncio, es que nunca se midio.
// De aqui en adelante un "Sin dato" si quiere decir algo (llego sin clic de
// anuncio y sin cookie del pixel). Por eso la nota se pone sola y se deja de
// poner sola, sin tener que acordarse de quitarla.
const DESDE_QUE_SE_MIDE = '2026-10-28';

// Campos que viajan del navegador al servidor y se guardan en el registro.
const CAMPOS = ['fbp', 'fbc', 'gclid', 'gbraid', 'wbraid'];

// Saca los ids de clic de un cuerpo de peticion, recortados y sin inventar
// nada: lo que no venga como texto se guarda como null.
function idsDeClic(body) {
  const fuente = body || {};
  const salida = {};
  CAMPOS.forEach((campo) => {
    const valor = fuente[campo];
    salida[campo] = typeof valor === 'string' && valor ? valor.slice(0, 200) : null;
  });
  return salida;
}

function origenDe(registro) {
  if (!registro) return { clave: 'sin_dato', etiqueta: 'Sin dato' };
  if (registro.fbc) return { clave: 'meta', etiqueta: 'Anuncio de Meta' };
  if (registro.gclid || registro.gbraid || registro.wbraid) {
    return { clave: 'google', etiqueta: 'Anuncio de Google' };
  }
  if (registro.fbp) return { clave: 'directo', etiqueta: 'Directo u orgánico' };
  const creado = String(registro.createdAt || '').slice(0, 10);
  return {
    clave: 'sin_dato',
    etiqueta: 'Sin dato',
    nota: creado && creado < DESDE_QUE_SE_MIDE ? 'de antes de que se midiera el origen' : null,
  };
}

module.exports = { origenDe, idsDeClic, CAMPOS, DESDE_QUE_SE_MIDE };
