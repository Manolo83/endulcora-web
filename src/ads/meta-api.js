// Cliente mínimo de la Marketing API de Meta (crear campañas, conjuntos y anuncios).
//
// No usa el SDK oficial a propósito: son cuatro llamadas HTTP y así el proyecto
// no gana otra dependencia. Node 20 ya trae `fetch` incorporado.

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

function tokenDeAcceso() {
  const token = process.env.META_ADS_TOKEN;
  if (!token) {
    throw new Error(
      'Falta META_ADS_TOKEN. Genera un token con permiso ads_management en ' +
        'developers.facebook.com > Herramientas > Explorador de la API Graph.'
    );
  }
  return token;
}

// Meta espera los objetos anidados (targeting, object_story_spec, ...) como
// texto JSON dentro del formulario, no como JSON anidado de verdad.
function aFormulario(cuerpo) {
  const form = new URLSearchParams();
  for (const [clave, valor] of Object.entries(cuerpo)) {
    if (valor === undefined || valor === null) continue;
    form.set(clave, typeof valor === 'object' ? JSON.stringify(valor) : String(valor));
  }
  return form;
}

function errorLegible(ruta, datos) {
  const err = (datos && datos.error) || {};
  // error_user_msg es el mensaje "de humano" que Meta muestra en el Administrador
  // de anuncios; suele decir exactamente qué campo está mal.
  const detalle = err.error_user_msg || err.message || 'error desconocido';
  const extra = err.error_subcode ? ` (subcódigo ${err.error_subcode})` : '';
  return new Error(`Meta rechazó POST ${ruta}: ${detalle}${extra}`);
}

async function postGraph(ruta, cuerpo) {
  const form = aFormulario(cuerpo);
  form.set('access_token', tokenDeAcceso());

  const respuesta = await fetch(`${GRAPH_BASE}/${ruta}`, { method: 'POST', body: form });
  const datos = await respuesta.json().catch(() => ({}));

  if (!respuesta.ok || datos.error) throw errorLegible(ruta, datos);
  return datos;
}

// Sube una imagen al ad account y devuelve su `image_hash`, que es lo que pide
// el creativo. `contenido` es un Buffer con el archivo (JPG o PNG).
async function subirImagen(cuentaId, nombreArchivo, contenido) {
  const datos = await postGraph(`act_${cuentaId}/adimages`, {
    bytes: contenido.toString('base64'),
    name: nombreArchivo,
  });

  // La respuesta viene como { images: { "<nombre>": { hash, url } } } y el nombre
  // de la llave no siempre coincide con el que mandamos, así que tomamos la primera.
  const imagenes = Object.values(datos.images || {});
  if (!imagenes.length || !imagenes[0].hash) {
    throw new Error(`Meta no devolvió el hash de la imagen ${nombreArchivo}.`);
  }
  return imagenes[0].hash;
}

const crearCampana = (cuentaId, payload) => postGraph(`act_${cuentaId}/campaigns`, payload);
const crearConjunto = (cuentaId, payload) => postGraph(`act_${cuentaId}/adsets`, payload);
const crearCreativo = (cuentaId, payload) => postGraph(`act_${cuentaId}/adcreatives`, payload);
const crearAnuncio = (cuentaId, payload) => postGraph(`act_${cuentaId}/ads`, payload);

module.exports = {
  GRAPH_VERSION,
  postGraph,
  subirImagen,
  crearCampana,
  crearConjunto,
  crearCreativo,
  crearAnuncio,
};
