'use strict';

// Cliente minimo de la Marketing API de Meta (Facebook/Instagram/WhatsApp).
// No usa SDK: solo fetch, para no agregar dependencias al proyecto.

const fs = require('fs');
const path = require('path');

const VERSION = process.env.META_API_VERSION || 'v23.0';
const BASE = `https://graph.facebook.com/${VERSION}`;

function token() {
  const t = process.env.META_ACCESS_TOKEN;
  if (!t) {
    throw new Error(
      'Falta META_ACCESS_TOKEN. Genera un token con permisos ads_management en\n' +
        'developers.facebook.com > Herramientas > Explorador de la API y ponlo en .env'
    );
  }
  return t;
}

// La API espera los objetos anidados (targeting, promoted_object, object_story_spec)
// como cadenas JSON, no como objetos.
function serializa(campos) {
  const salida = {};
  for (const [clave, valor] of Object.entries(campos)) {
    if (valor === undefined || valor === null) continue;
    salida[clave] = typeof valor === 'object' ? JSON.stringify(valor) : String(valor);
  }
  return salida;
}

async function leeRespuesta(res, ruta) {
  const texto = await res.text();
  let datos;
  try {
    datos = JSON.parse(texto);
  } catch {
    throw new Error(`Meta respondió algo que no es JSON en ${ruta}: ${texto.slice(0, 300)}`);
  }
  if (!res.ok || datos.error) {
    const e = datos.error || {};
    const detalle = e.error_user_msg || e.message || texto.slice(0, 300);
    const pista = e.error_user_title ? ` (${e.error_user_title})` : '';
    throw new Error(`Meta rechazó ${ruta}${pista}: ${detalle}`);
  }
  return datos;
}

async function post(ruta, campos) {
  const body = new URLSearchParams({ ...serializa(campos), access_token: token() });
  const res = await fetch(`${BASE}/${ruta}`, { method: 'POST', body });
  return leeRespuesta(res, ruta);
}

async function get(ruta, params = {}) {
  const query = new URLSearchParams({ ...serializa(params), access_token: token() });
  const res = await fetch(`${BASE}/${ruta}?${query}`, { method: 'GET' });
  return leeRespuesta(res, ruta);
}

// Sube una imagen local y devuelve su hash, que es lo que pide el creativo.
async function subeImagen(cuentaId, rutaArchivo) {
  const nombre = path.basename(rutaArchivo);
  const buffer = fs.readFileSync(rutaArchivo);
  const form = new FormData();
  form.append('access_token', token());
  form.append('filename', new Blob([buffer]), nombre);

  const ruta = `act_${cuentaId}/adimages`;
  const res = await fetch(`${BASE}/${ruta}`, { method: 'POST', body: form });
  const datos = await leeRespuesta(res, ruta);

  const imagenes = datos.images || {};
  const primera = imagenes[nombre] || Object.values(imagenes)[0];
  if (!primera || !primera.hash) {
    throw new Error(`Meta aceptó ${nombre} pero no devolvió el hash de la imagen.`);
  }
  return primera.hash;
}

const crearCampana = (cuentaId, campos) => post(`act_${cuentaId}/campaigns`, campos);
const crearConjunto = (cuentaId, campos) => post(`act_${cuentaId}/adsets`, campos);
const crearCreativo = (cuentaId, campos) => post(`act_${cuentaId}/adcreatives`, campos);
const crearAnuncio = (cuentaId, campos) => post(`act_${cuentaId}/ads`, campos);

module.exports = {
  VERSION,
  get,
  post,
  subeImagen,
  crearCampana,
  crearConjunto,
  crearCreativo,
  crearAnuncio,
};
