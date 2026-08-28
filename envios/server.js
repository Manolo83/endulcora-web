require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const cookieSession = require('cookie-session');

const { UPLOAD_DIR, APP_PASSWORD } = require('./src/config');
const almacen = require('./src/almacen');
const { normalizarFilas } = require('./src/normalizar');
const { generarPDF, generarPNG } = require('./src/reconocimiento');
const { enviarReconocimiento, estaConfigurado } = require('./src/correo');

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(cookieSession({
  name: 'endulcora_envios',
  secret: process.env.SESSION_SECRET || 'cambia-este-texto',
  maxAge: 12 * 60 * 60 * 1000,
  sameSite: 'lax',
}));

const subir = multer({ dest: UPLOAD_DIR, limits: { fileSize: 30 * 1024 * 1024 } });

// ---- Acceso: una sola contrasena compartida entre Lex y Alek ----
function pedirAcceso(req, res, next) {
  if (req.session && req.session.dentro) return next();
  return res.status(401).json({ error: 'Necesitas iniciar sesión.' });
}

app.post('/api/entrar', (req, res) => {
  const clave = String((req.body && req.body.clave) || '');
  if (!APP_PASSWORD) {
    return res.status(500).json({ error: 'Falta configurar APP_PASSWORD en el servidor.' });
  }
  if (clave !== APP_PASSWORD) {
    return res.status(401).json({ error: 'Contraseña incorrecta.' });
  }
  req.session.dentro = true;
  // Se guarda quien esta usando la app para que el historial lo registre.
  req.session.quien = String((req.body && req.body.quien) || '').trim() || 'Equipo';
  res.json({ ok: true, quien: req.session.quien });
});

app.post('/api/salir', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

app.get('/api/sesion', (req, res) => {
  res.json({
    dentro: Boolean(req.session && req.session.dentro),
    quien: (req.session && req.session.quien) || '',
    correoListo: estaConfigurado(),
    plantillaLista: Boolean(almacen.getPlantilla()),
    folioSiguiente: almacen.getFolioSiguiente(),
  });
});

// ---- Catalogo de talleres (para las vinetas y el buscador) ----
app.get('/api/talleres', pedirAcceso, (req, res) => {
  res.json(almacen.catalogo('talleres'));
});

// ---- Contactos ----
app.get('/api/contactos', pedirAcceso, (req, res) => {
  const buscar = String(req.query.buscar || '').trim().toLowerCase();
  let lista = almacen.getContactos();
  if (buscar) {
    lista = lista.filter(
      (c) => c.nombre.toLowerCase().includes(buscar) || c.email.includes(buscar)
    );
  }
  res.json({ total: almacen.getContactos().length, resultados: lista.slice(0, 200) });
});

// Tablero de inicio: los numeros de un vistazo.
app.get('/api/resumen', pedirAcceso, (req, res) => {
  res.json(almacen.resumen());
});

// Ficha de una persona: sus datos mas todo lo que se le ha enviado.
app.get('/api/contactos/:id', pedirAcceso, (req, res) => {
  const contacto = almacen.getContactoPorId(req.params.id);
  if (!contacto) return res.status(404).json({ error: 'No encontrado.' });
  res.json({ contacto, historial: almacen.historialDeContacto(contacto.id) });
});

app.post('/api/contactos', pedirAcceso, (req, res) => {
  const { nombre, email, telefono } = req.body || {};
  if (!String(nombre || '').trim()) return res.status(400).json({ error: 'Falta el nombre.' });
  res.json(almacen.agregarContacto({ nombre, email, telefono, origen: 'manual' }));
});

app.put('/api/contactos/:id', pedirAcceso, (req, res) => {
  const c = almacen.actualizarContacto(req.params.id, req.body || {});
  if (!c) return res.status(404).json({ error: 'No encontrado.' });
  res.json(c);
});

app.delete('/api/contactos/:id', pedirAcceso, (req, res) => {
  res.json({ ok: almacen.borrarContacto(req.params.id) });
});

// Importa el CSV que se exporta de la hoja de Drive.
app.post('/api/contactos/importar', pedirAcceso, subir.single('archivo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Falta el archivo.' });
  try {
    const texto = fs.readFileSync(req.file.path, 'utf8');
    const filas = leerCSV(texto);
    const { contactos, resumen } = normalizarFilas(filas);
    const guardado = almacen.importarContactos(contactos);
    res.json({ resumen, ...guardado });
  } catch (e) {
    res.status(400).json({ error: `No se pudo leer el archivo: ${e.message}` });
  } finally {
    fs.unlink(req.file.path, () => {});
  }
});

// ---- Plantilla del reconocimiento ----
app.post('/api/plantilla', pedirAcceso, subir.single('archivo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Falta la imagen de la plantilla.' });
  const destino = path.join(UPLOAD_DIR, 'plantilla-reconocimiento.png');
  fs.renameSync(req.file.path, destino);
  res.json(almacen.setPlantilla({ archivo: destino, subida: new Date().toISOString() }));
});

// Vista previa: muestra como quedaria el reconocimiento antes de mandarlo.
app.get('/api/vista-previa', pedirAcceso, async (req, res) => {
  const plantilla = almacen.getPlantilla();
  if (!plantilla) return res.status(400).json({ error: 'Todavía no subes la plantilla del reconocimiento.' });
  try {
    const png = await generarPNG({
      rutaPlantilla: plantilla.archivo,
      nombre: req.query.nombre || 'Nombre de ejemplo',
      taller: req.query.taller || 'Taller de ejemplo',
      folio: almacen.getFolioSiguiente(),
      fecha: req.query.fecha || new Date(),
    });
    res.type('png').send(png);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Envio ----
app.post('/api/enviar', pedirAcceso, async (req, res) => {
  const plantilla = almacen.getPlantilla();
  if (!plantilla) return res.status(400).json({ error: 'Falta subir la plantilla del reconocimiento.' });

  const { taller, fecha, participantes } = req.body || {};
  if (!String(taller || '').trim()) return res.status(400).json({ error: 'Falta el nombre del taller.' });
  if (!Array.isArray(participantes) || !participantes.length) {
    return res.status(400).json({ error: 'No hay participantes seleccionados.' });
  }

  const resultados = [];
  for (const p of participantes) {
    // Se enlaza con su ficha para que el envio aparezca en su historial. Si es
    // alguien nuevo, se da de alta aqui mismo y no se queda fuera del CRM.
    let ficha = almacen.buscarPorEmail(p.email);
    if (!ficha) {
      ficha = almacen.agregarContacto({ nombre: p.nombre, email: p.email, origen: 'envío' });
    }
    // El folio se APARTA para armar el PDF, pero solo se da por consumido si el
    // correo sale. Asi un rebote no deja huecos en la numeracion oficial: el
    // siguiente intento reutiliza ese mismo folio.
    const folio = almacen.getFolioSiguiente();
    try {
      const pdf = await generarPDF({
        rutaPlantilla: plantilla.archivo,
        nombre: p.nombre,
        taller,
        folio,
        fecha: fecha || new Date(),
      });
      await enviarReconocimiento({
        to: p.email,
        nombre: p.nombre,
        taller,
        pdf,
        nombreArchivo: `Reconocimiento ${taller} - ${p.nombre}.pdf`,
      });
      almacen.setFolioSiguiente(folio + 1);
      resultados.push({ contactoId: ficha.id, nombre: p.nombre, email: p.email, folio, estado: 'enviado' });
    } catch (e) {
      // No se avanza el folio: queda libre para el reintento.
      resultados.push({ contactoId: ficha.id, nombre: p.nombre, email: p.email, folio: null, estado: 'falló', error: e.message });
    }
    // Pausa breve entre correos para no pegarle al limite de Resend.
    await new Promise((r) => setTimeout(r, 350));
  }

  const envio = almacen.crearEnvio({
    taller,
    fecha: fecha || new Date().toISOString().slice(0, 10),
    quien: (req.session && req.session.quien) || 'Equipo',
    resultados,
    enviados: resultados.filter((r) => r.estado === 'enviado').length,
    fallidos: resultados.filter((r) => r.estado !== 'enviado').length,
  });
  res.json(envio);
});

app.get('/api/historial', pedirAcceso, (req, res) => {
  res.json(almacen.getEnvios().slice(0, 100));
});

// Lector de CSV que respeta las comillas y los saltos de linea dentro de una
// celda, que es como Google Sheets exporta las respuestas largas.
function leerCSV(texto) {
  const filas = [];
  let fila = [];
  let celda = '';
  let enComillas = false;
  const limpio = texto.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i];
    if (enComillas) {
      if (c === '"') {
        if (limpio[i + 1] === '"') { celda += '"'; i++; }
        else enComillas = false;
      } else celda += c;
    } else if (c === '"') {
      enComillas = true;
    } else if (c === ',') {
      fila.push(celda); celda = '';
    } else if (c === '\n') {
      fila.push(celda); filas.push(fila); fila = []; celda = '';
    } else celda += c;
  }
  if (celda || fila.length) { fila.push(celda); filas.push(fila); }
  return filas.filter((f) => f.some((x) => String(x).trim()));
}

app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3100;
// Se escucha en 0.0.0.0 y no solo en localhost: es lo que necesita Railway (o
// cualquier hosting) para poder alcanzar la app desde fuera del contenedor.
app.listen(PORT, '0.0.0.0', () => {
  console.log(`App de envíos de Endulcora escuchando en el puerto ${PORT}`);
});
