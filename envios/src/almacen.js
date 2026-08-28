const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DATA_DIR, UPLOAD_DIR, CATALOGO_DIR } = require('./config');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ARCHIVO = path.join(DATA_DIR, 'endulcora-envios.json');

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
  for (const campo of ['nombre', 'email', 'telefono']) {
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
function getPlantilla() {
  return leer().plantilla;
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
  UPLOAD_DIR,
  catalogo,
  getContactos,
  agregarContacto,
  importarContactos,
  actualizarContacto,
  borrarContacto,
  tomarFolio,
  getFolioSiguiente,
  setFolioSiguiente,
  getPlantilla,
  setPlantilla,
  getEnvios,
  crearEnvio,
  actualizarEnvio,
};
