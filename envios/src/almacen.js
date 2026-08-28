const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DATA_DIR, UPLOAD_DIR, CATALOGO_DIR } = require('./config');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ARCHIVO = path.join(DATA_DIR, 'endulcora-envios.json');

// ¿Los datos estan en un disco que sobrevive a los redespliegues?
//
// En un servidor, un volumen se monta como un sistema de archivos aparte. Si
// DATA_DIR vive en el mismo disco que la raiz, entonces NO hay volumen: los
// datos estan dentro del contenedor y se borran enteros en cada actualizacion.
//
// Se comprueba comparando el identificador de dispositivo de las dos rutas.
// Sin esto el fallo es mudo: la app funciona, se importan miles de contactos,
// y desaparecen en el siguiente despliegue sin que nada lo haya advertido.
function datosSonPermanentes() {
  // En una computadora personal no hay volumen que valga: siempre es permanente.
  if (!process.env.RAILWAY_ENVIRONMENT && !process.env.PORT) return true;
  try {
    return fs.statSync(DATA_DIR).dev !== fs.statSync('/').dev;
  } catch (e) {
    return true; // Ante la duda no se alarma.
  }
}

const DATOS_PERMANENTES = datosSonPermanentes();
if (!DATOS_PERMANENTES) {
  console.error(
    '[almacen] ATENCIÓN: ' + DATA_DIR + ' no está en un volumen. Todo lo que se ' +
    'guarde (contactos, historial, folios) se BORRARÁ en el próximo despliegue. ' +
    'En Railway: clic derecho en el servicio → Attach Volume → ruta ' + DATA_DIR
  );
}

// Estructura inicial. El folio arranca donde va tu hoja "RECONOCIMIENTOS HECHOS"
// para que la numeracion siga siendo continua y no se repita ningun folio.
function datosPorDefecto() {
  return {
    contactos: [],
    talleres: [],
    envios: [],
    plantilla: null,
    folioSiguiente: 2964,
    version: 1,
  };
}

let cache = null;

function leer() {
  if (cache) return cache;
  try {
    cache = { ...datosPorDefecto(), ...JSON.parse(fs.readFileSync(ARCHIVO, 'utf8')) };
  } catch (e) {
    cache = datosPorDefecto();
  }
  return cache;
}

function guardar() {
  // Se escribe primero a un temporal y luego se renombra, para que un corte de
  // luz a media escritura no deje el archivo de datos a medias.
  const tmp = ARCHIVO + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
  fs.renameSync(tmp, ARCHIVO);
}

function id(prefijo) {
  return `${prefijo}-${crypto.randomBytes(6).toString('hex')}`;
}

// ---- Catalogos que vienen del repositorio (no cambian desde la app) ----
function catalogo(nombre) {
  try {
    return JSON.parse(fs.readFileSync(path.join(CATALOGO_DIR, `${nombre}.json`), 'utf8'));
  } catch (e) {
    return [];
  }
}

// ---- Contactos ----
function getContactos() {
  return leer().contactos;
}

function agregarContacto({ nombre, email, telefono, origen }) {
  const d = leer();
  const contacto = {
    id: id('con'),
    nombre: String(nombre || '').trim(),
    email: String(email || '').trim().toLowerCase(),
    telefono: String(telefono || '').trim(),
    notas: '',
    origen: origen || 'manual',
    creado: new Date().toISOString(),
  };
  d.contactos.push(contacto);
  guardar();
  return contacto;
}

// Mete muchos contactos de golpe (importacion). Si el correo ya existe, se
// actualiza el nombre solo cuando el nuevo es mas completo, para no empeorar
// un nombre que ya estaba bien escrito.
function importarContactos(lista) {
  const d = leer();
  const porEmail = new Map(d.contactos.map((c) => [c.email, c]));
  let nuevos = 0;
  let actualizados = 0;

  for (const item of lista) {
    const email = String(item.email || '').trim().toLowerCase();
    if (!email) continue;
    const existente = porEmail.get(email);
    if (!existente) {
      const contacto = {
        id: id('con'),
        nombre: item.nombre || '',
        email,
        telefono: item.telefono || '',
        notas: '',
        origen: item.origen || 'drive',
        creado: new Date().toISOString(),
      };
      d.contactos.push(contacto);
      porEmail.set(email, contacto);
      nuevos++;
    } else {
      let cambio = false;
      if ((item.nombre || '').length > (existente.nombre || '').length) {
        existente.nombre = item.nombre;
        cambio = true;
      }
      if (!existente.telefono && item.telefono) {
        existente.telefono = item.telefono;
        cambio = true;
      }
      if (cambio) actualizados++;
    }
  }
  guardar();
  return { nuevos, actualizados, total: d.contactos.length };
}

function actualizarContacto(idContacto, cambios) {
  const d = leer();
  const c = d.contactos.find((x) => x.id === idContacto);
  if (!c) return null;
  for (const campo of ['nombre', 'email', 'telefono', 'notas']) {
    if (cambios[campo] !== undefined) c[campo] = String(cambios[campo]).trim();
  }
  guardar();
  return c;
}

function borrarContacto(idContacto) {
  const d = leer();
  const i = d.contactos.findIndex((x) => x.id === idContacto);
  if (i === -1) return false;
  d.contactos.splice(i, 1);
  guardar();
  return true;
}


// ---- Ficha de cliente ----
function getContactoPorId(idContacto) {
  return leer().contactos.find((c) => c.id === idContacto) || null;
}

function buscarPorEmail(email) {
  const buscado = String(email || '').trim().toLowerCase();
  if (!buscado) return null;
  return leer().contactos.find((c) => c.email === buscado) || null;
}

// Reune todo lo que se le ha mandado a una persona, sacandolo del historial de
// envios. No se guarda por duplicado en el contacto: si un envio se corrige, la
// ficha se corrige sola.
function historialDeContacto(idContacto) {
  const contacto = getContactoPorId(idContacto);
  if (!contacto) return [];
  const linea = [];
  for (const envio of leer().envios) {
    for (const r of envio.resultados || []) {
      const esSuyo = r.contactoId
        ? r.contactoId === idContacto
        : String(r.email || '').toLowerCase() === contacto.email;
      if (!esSuyo) continue;
      linea.push({
        envioId: envio.id,
        taller: envio.taller,
        fechaTaller: envio.fecha,
        enviado: envio.creado,
        quien: envio.quien,
        folio: r.folio,
        estado: r.estado,
        error: r.error || '',
      });
    }
  }
  return linea;
}

// Numeros para el tablero de inicio.
function resumen() {
  const d = leer();
  const enviados = d.envios.reduce((n, e) => n + (e.enviados || 0), 0);
  const fallidos = d.envios.reduce((n, e) => n + (e.fallidos || 0), 0);
  const talleresDados = new Set(d.envios.map((e) => e.taller)).size;
  return {
    contactos: d.contactos.length,
    envios: d.envios.length,
    reconocimientosEnviados: enviados,
    reconocimientosFallidos: fallidos,
    talleresDados,
    folioSiguiente: d.folioSiguiente,
    ultimos: d.envios.slice(0, 5).map((e) => ({
      id: e.id, taller: e.taller, creado: e.creado,
      enviados: e.enviados, fallidos: e.fallidos, quien: e.quien,
    })),
  };
}

// ---- Folios ----
function tomarFolio() {
  const d = leer();
  const folio = d.folioSiguiente;
  d.folioSiguiente = folio + 1;
  guardar();
  return folio;
}

function getFolioSiguiente() {
  return leer().folioSiguiente;
}

function setFolioSiguiente(n) {
  const d = leer();
  d.folioSiguiente = Number(n) || d.folioSiguiente;
  guardar();
  return d.folioSiguiente;
}

// ---- Plantilla del reconocimiento ----
// La app trae una plantilla de fabrica en marca/, asi que funciona desde el
// primer arranque sin tener que subir nada. Si alguien sube otra, esa manda.
const PLANTILLA_DE_FABRICA = path.join(__dirname, '..', 'marca', 'plantilla-reconocimiento.png');

function getPlantilla() {
  const propia = leer().plantilla;
  if (propia && fs.existsSync(propia.archivo)) return propia;
  if (fs.existsSync(PLANTILLA_DE_FABRICA)) {
    return { archivo: PLANTILLA_DE_FABRICA, deFabrica: true };
  }
  return null;
}

// ---- Firma del chef ----
const RUTA_FIRMA = path.join(__dirname, '..', 'marca', 'firma-chef.png');

// La firma puede venir de dos lados: como archivo aparte, o ya dibujada dentro
// de la plantilla. El segundo caso es el normal cuando la plantilla se exporta
// de Canva, y no hay forma de detectarlo mirando la imagen, asi que se pregunta
// una vez y se recuerda.
function hayFirma() {
  return fs.existsSync(RUTA_FIRMA) || leer().plantillaTraeFirma === true;
}

function getPlantillaTraeFirma() {
  return leer().plantillaTraeFirma === true;
}

function setPlantillaTraeFirma(valor) {
  const d = leer();
  d.plantillaTraeFirma = Boolean(valor);
  guardar();
  return d.plantillaTraeFirma;
}

function guardarFirma(rutaTemporal) {
  fs.renameSync(rutaTemporal, RUTA_FIRMA);
  return { archivo: RUTA_FIRMA, subida: new Date().toISOString() };
}

function setPlantilla(p) {
  const d = leer();
  d.plantilla = p;
  guardar();
  return p;
}

// ---- Envios (historial) ----
function getEnvios() {
  return leer().envios;
}

function crearEnvio(envio) {
  const d = leer();
  const registro = { id: id('env'), creado: new Date().toISOString(), ...envio };
  d.envios.unshift(registro);
  guardar();
  return registro;
}

function actualizarEnvio(idEnvio, cambios) {
  const d = leer();
  const e = d.envios.find((x) => x.id === idEnvio);
  if (!e) return null;
  Object.assign(e, cambios);
  guardar();
  return e;
}

module.exports = {
  DATA_DIR,
  DATOS_PERMANENTES,
  UPLOAD_DIR,
  catalogo,
  getContactos,
  agregarContacto,
  importarContactos,
  actualizarContacto,
  borrarContacto,
  getContactoPorId,
  buscarPorEmail,
  historialDeContacto,
  resumen,
  tomarFolio,
  getFolioSiguiente,
  setFolioSiguiente,
  getPlantilla,
  setPlantilla,
  hayFirma,
  guardarFirma,
  getPlantillaTraeFirma,
  setPlantillaTraeFirma,
  getEnvios,
  crearEnvio,
  actualizarEnvio,
};
