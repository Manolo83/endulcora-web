// Portal de Lex (Fase 1): ver los talleres por sede, entrar a cada uno y
// marcar quien ya liquido su taller y con que forma de pago. Vive aparte de
// /admin (otro codigo de entrada, pantallas mucho mas simples) pero lee y
// escribe la MISMA base de datos — un inscrito que Lex marca como pagado
// aqui es el mismo que se ve en /admin y el mismo que cuenta para el cupo
// del taller en la pagina publica.
const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const store = require('../store');
const email = require('../email');
const enviosClient = require('../enviosClient');
const { requireLex, checkLexCode } = require('../authLex');
const { UPLOAD_DIR, SITE_URL } = require('../config');

const router = express.Router();

const uploadRecetario = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('El recetario debe ser un PDF.'));
  },
});

router.post('/codigo', (req, res) => {
  const { codigo } = req.body || {};
  if (!checkLexCode(codigo)) {
    return res.status(401).json({ error: 'Código incorrecto' });
  }
  req.session.isLex = true;
  res.json({ ok: true });
});

router.post('/salir', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

router.get('/api/sesion', (req, res) => {
  res.json({ isLex: !!(req.session && req.session.isLex) });
});

// Revisa que la conexion con el servicio de reconocimientos funcione, sin
// mandar nada ni gastar ningun folio -- para confirmar antes de usarlo de
// verdad que ENVIOS_API_URL/ENVIOS_APP_PASSWORD quedaron bien puestas.
router.get('/api/reconocimientos/estado', requireLex, async (req, res) => {
  if (!enviosClient.configurado()) {
    return res.json({ conectado: false, error: `Falta configurar: ${enviosClient.faltantes().join(', ')}.` });
  }
  try {
    const estado = await enviosClient.estado();
    res.json({ conectado: true, folioSiguiente: estado.folioSiguiente, plantillaLista: estado.plantillaLista, firmaLista: estado.firmaLista });
  } catch (e) {
    res.json({ conectado: false, error: e.message });
  }
});

const EN_LINEA = 'En línea (Mercado Pago)';
const FORMAS_PAGO = ['Efectivo', 'Tarjeta de crédito', 'Tarjeta de débito', 'Transferencia', EN_LINEA];
const ESTADOS_PAGO = ['pendiente', 'pagado', 'cancelado'];

// Catalogo fijo de lo que Lex vende ademas del taller (precios dados por
// el dueño del sitio). "Membresía Club Endulcora" es el concepto exacto
// que activa la membresia sola al guardar la venta — ver POST /ventas.
const CONCEPTO_MEMBRESIA = 'Membresía Club Endulcora (mensual)';
const CATALOGO = [
  { concepto: 'Red desechable', precio: 10 },
  { concepto: 'Gorro reutilizable', precio: 30 },
  { concepto: 'Cofia', precio: 50 },
  { concepto: 'Mandil liso', precio: 80 },
  { concepto: 'Mandil diseño', precio: 120 },
  { concepto: 'Trapo', precio: 20 },
  { concepto: 'Domo tipo pastel', precio: 30 },
  { concepto: 'Domo charola', precio: 20 },
  { concepto: 'Tupper cuadrado', precio: 20 },
  { concepto: 'Reconocimiento', precio: 50 },
  { concepto: CONCEPTO_MEMBRESIA, precio: 100 },
];

// Los eBooks reales del catalogo de endulcora.com (no el generico de
// antes): asi, cuando Lex vende uno en persona, se le manda por correo el
// mismo archivo (y su anexo/app, si los tiene) que recibiria alguien que
// compra en linea -- no solo se cobra, tambien se entrega.
function ebooksDelCatalogo() {
  return store.getProducts()
    .filter((p) => p.categoria === 'ebook' && !p.ocultoEnCatalogo && p.archivo)
    .map((p) => ({ productoId: p.id, concepto: p.titulo, precio: Number(p.precio) || 0 }));
}

// Junta el archivo propio de un producto con los de sus relacionados
// (anexo, app) que SI tengan archivo cargado -- lo que de verdad se le
// manda a quien compra ese eBook.
function archivosDeProducto(producto) {
  const propios = producto.archivo ? [{ archivo: producto.archivo, archivoNombre: producto.archivoNombre || producto.titulo }] : [];
  // El "paquete completo" es su propio producto que se vende aparte (ya
  // trae de por si todo junto en un .zip) -- no se incluye como si fuera
  // un anexo gratis del eBook base, o se mandarian los mismos archivos
  // duplicados dos veces.
  const relacionados = (producto.productosRelacionados || [])
    .map((id) => store.getProduct(id))
    .filter((p) => p && p.archivo && !p.esPaquete)
    .map((p) => ({ archivo: p.archivo, archivoNombre: p.archivoNombre || p.titulo }));
  return [...propios, ...relacionados];
}

function hoyISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Talleres de hoy en adelante, agrupados por sede — lo primero que Lex ve
// al entrar. Cada uno trae cuantos inscritos tiene y cuantos ya liquidaron,
// para que sepa de un vistazo donde falta cobrar sin tener que abrir cada
// taller.
router.get('/api/talleres', requireLex, (req, res) => {
  const hoy = hoyISO();
  const sedes = store.getSedes();
  const sedesPorId = new Map(sedes.map((s) => [s.id, s]));
  const inscripciones = store.getInscripcionesTaller();
  const porSesion = new Map();
  inscripciones.forEach((i) => {
    if (!porSesion.has(i.sesionTallerId)) porSesion.set(i.sesionTallerId, []);
    porSesion.get(i.sesionTallerId).push(i);
  });

  const sesiones = store.getSesionesTaller()
    .filter((s) => s.fecha >= hoy)
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .map((s) => {
      const inscritos = porSesion.get(s.id) || [];
      const liquidados = inscritos.filter((i) => i.estadoPago === 'pagado' && (i.saldo || 0) <= 0).length;
      const sede = sedesPorId.get(s.sedeId);
      return {
        id: s.id,
        titulo: s.titulo,
        fecha: s.fecha,
        horario: s.horario,
        sedeId: s.sedeId,
        sede: sede ? sede.nombre : '',
        cupoMaximo: s.cupoMaximo || null,
        cupoRestante: s.cupoRestante,
        totalInscritos: inscritos.length,
        totalLiquidados: liquidados,
      };
    });

  res.json({ talleres: sesiones });
});

// El detalle de un taller: cada inscrito con lo que necesita Lex para
// cobrar — cuanto dio de anticipo, cuanto le falta, y poder cambiar su
// estado/forma de pago ahi mismo.
router.get('/api/talleres/:id/inscritos', requireLex, (req, res) => {
  const sesion = store.getSesionesTaller().find((s) => s.id === Number(req.params.id));
  if (!sesion) return res.status(404).json({ error: 'Taller no encontrado' });
  const sede = store.getSedes().find((s) => s.id === sesion.sedeId);
  const inscritos = store.getInscripcionesTaller()
    .filter((i) => i.sesionTallerId === sesion.id)
    .map((i) => ({
      id: i.id,
      nombre: i.nombre,
      whatsapp: i.whatsapp,
      correo: i.correo,
      montoPagado: i.montoPagado,
      saldo: i.saldo,
      estadoPago: i.estadoPago,
      // Una compra pagada de verdad en linea (Mercado Pago) nunca trae
      // formaPago -- el cobro automatico no la llena, solo el estado y el
      // monto. Se la mostramos a Lex como "En linea" para que no parezca
      // un registro sin forma de pago; si ella le da Guardar sin cambiarla,
      // queda escrita tal cual (no pasa nada, nadie mas depende de que el
      // campo siga vacio).
      formaPago: !i.formaPago && i.estadoPago === 'pagado' ? EN_LINEA : i.formaPago,
      ventasExtra: i.ventasExtra || [],
      asistio: !!i.asistio,
      recetarioEnviado: !!i.recetarioEnviado,
      reconocimientoEnviado: !!i.reconocimientoEnviado,
      reconocimientoFolio: i.reconocimientoFolio || null,
    }));
  const recetario = store.getRecetarioTaller(sesion.titulo);
  res.json({
    taller: {
      id: sesion.id,
      titulo: sesion.titulo,
      fecha: sesion.fecha,
      horario: sesion.horario,
      sede: sede ? sede.nombre : '',
      precioTotal: sesion.precioTotal,
      recetario: recetario ? { archivo: recetario.archivo, archivoNombre: recetario.archivoNombre } : null,
    },
    inscritos,
    formasPago: FORMAS_PAGO,
    catalogo: CATALOGO,
    ebooks: ebooksDelCatalogo(),
  });
});

// Sube (o reemplaza) el recetario PDF de este taller. Se guarda por
// TITULO, no por esta fecha -- sirve sola para cualquier otra sesion
// futura del mismo taller, sin volver a subirlo.
router.post('/api/talleres/:id/recetario', requireLex, uploadRecetario.single('archivo'), (req, res) => {
  const sesion = store.getSesionesTaller().find((s) => s.id === Number(req.params.id));
  if (!sesion) return res.status(404).json({ error: 'Taller no encontrado' });
  if (!req.file) return res.status(400).json({ error: 'Sube un archivo PDF.' });
  const recetario = store.guardarRecetarioTaller(sesion.titulo, {
    archivo: `/uploads/${req.file.filename}`,
    archivoNombre: req.file.originalname,
  });
  res.json(recetario);
});

// Marca (o quita) la asistencia de un inscrito. Si se marca que asistio y
// todavia no se le habia mandado el recetario de este taller, lo manda en
// automatico y dice que paso -- para que Lex vea en el acto a quien le
// llego y a quien no (sin correo o sin recetario cargado).
router.post('/api/inscripciones/:id/asistencia', requireLex, async (req, res) => {
  const { asistio } = req.body || {};
  const inscripcion = store.getInscripcionTaller(req.params.id);
  if (!inscripcion) return res.status(404).json({ error: 'No encontrado' });
  const actualizado = store.marcarAsistenciaInscripcionTaller(req.params.id, asistio);

  let recetarioEstado = null;
  if (asistio && !inscripcion.recetarioEnviado) {
    const sesion = store.getSesionesTaller().find((s) => s.id === inscripcion.sesionTallerId);
    const recetario = sesion ? store.getRecetarioTaller(sesion.titulo) : null;
    if (!inscripcion.correo) {
      recetarioEstado = 'sinCorreo';
    } else if (!recetario) {
      recetarioEstado = 'sinRecetario';
    } else {
      try {
        await email.enviarCorreoRecetarioTaller({
          to: inscripcion.correo,
          nombre: inscripcion.nombre,
          taller: sesion.titulo,
          siteUrl: SITE_URL,
          archivo: recetario.archivo,
          archivoNombre: recetario.archivoNombre,
        });
        store.marcarRecetarioEnviado(inscripcion.id);
        recetarioEstado = 'enviado';
      } catch (e) {
        console.error(`[lex] No se pudo mandar el recetario a la inscripcion ${inscripcion.id}:`, e.message);
        recetarioEstado = 'error';
      }
    }
  }
  res.json({ ...actualizado, recetarioEstado });
});

router.patch('/api/inscripciones/:id/pago', requireLex, (req, res) => {
  const { montoPagado, estadoPago, formaPago } = req.body || {};
  if (estadoPago !== undefined && !ESTADOS_PAGO.includes(estadoPago)) {
    return res.status(400).json({ error: 'Estado de pago no válido.' });
  }
  if (formaPago !== undefined && formaPago !== '' && !FORMAS_PAGO.includes(formaPago)) {
    return res.status(400).json({ error: 'Forma de pago no válida.' });
  }
  const item = store.actualizarPagoInscripcionTaller(req.params.id, { montoPagado, estadoPago, formaPago });
  if (!item) return res.status(404).json({ error: 'No encontrado' });
  res.json(item);
});

// Si entre lo vendido hay una membresia y esa persona YA tiene cuenta en
// el sitio (mismo correo del registro), la activa sola — mismo efecto que
// el dueño del sitio dandola de alta a mano en /admin. Si todavia no
// tiene cuenta, no se inventa una con contraseña al aire: se avisa para
// que el equipo la resuelva (la venta igual queda registrada).
function intentarActivarMembresia(correo, huboMembresia) {
  if (!huboMembresia) return null;
  const user = store.getUserByEmail(correo);
  if (!user) return 'sinCuenta';
  if (user.membresiaEstado !== 'activa') {
    const patch = { membresiaEstado: 'activa', membresiaActivaDesde: hoyISO() };
    if (!user.membresiaPrimeraActivacion) patch.membresiaPrimeraActivacion = new Date().toISOString();
    store.updateUser(user.id, patch);
  }
  return 'activada';
}

router.post('/api/inscripciones/:id/ventas', requireLex, async (req, res) => {
  const { items, formaPago } = req.body || {};
  if (formaPago !== undefined && formaPago !== '' && !FORMAS_PAGO.includes(formaPago)) {
    return res.status(400).json({ error: 'Forma de pago no válida.' });
  }
  const item = store.agregarVentaExtraInscripcion(req.params.id, { items, formaPago });
  if (!item) return res.status(400).json({ error: 'Agrega al menos un artículo con nombre.' });
  const huboMembresia = Array.isArray(items) && items.some((it) => it.concepto === CONCEPTO_MEMBRESIA);
  const membresia = intentarActivarMembresia(item.correo, huboMembresia);

  // Si entre lo vendido hay eBooks reales del catalogo, se le mandan por
  // correo de una vez (mismos archivos que recibiria si lo hubiera
  // comprado en linea) -- vender un eBook sin entregarlo no sirve de nada.
  let ebooks = null;
  const idsEbooks = Array.isArray(items) ? [...new Set(items.map((it) => it.productoId).filter(Boolean))] : [];
  if (idsEbooks.length) {
    if (!item.correo) {
      ebooks = 'sinCorreo';
    } else {
      const productos = idsEbooks.map((id) => store.getProduct(id)).filter(Boolean);
      const archivos = productos.flatMap((p) => archivosDeProducto(p));
      if (!archivos.length) {
        ebooks = 'sinArchivo';
      } else {
        try {
          await email.enviarCorreoEbooksTaller({
            to: item.correo,
            nombre: item.nombre,
            titulos: productos.map((p) => p.titulo),
            siteUrl: SITE_URL,
            archivos,
          });
          ebooks = 'enviado';
        } catch (e) {
          console.error(`[lex] No se pudieron mandar los eBooks a la inscripcion ${item.id}:`, e.message);
          ebooks = 'error';
        }
      }
    }
  }

  res.json({ ...item, membresia, ebooks });
});

router.delete('/api/inscripciones/:id/ventas/:ventaId', requireLex, (req, res) => {
  const item = store.borrarVentaExtraInscripcion(req.params.id, req.params.ventaId);
  if (!item) return res.status(404).json({ error: 'No encontrado' });
  res.json(item);
});

// Manda el reconocimiento de un inscrito usando el servicio "envios" ya
// armado (folio, plantilla, historial) -- Lex no sale de este portal, el
// servidor es quien le habla al otro servicio por detras.
router.post('/api/inscripciones/:id/reconocimiento', requireLex, async (req, res) => {
  const inscripcion = store.getInscripcionTaller(req.params.id);
  if (!inscripcion) return res.status(404).json({ error: 'No encontrado' });
  if (!inscripcion.correo) return res.status(400).json({ error: 'Esta persona no tiene correo registrado.' });
  const sesion = store.getSesionesTaller().find((s) => s.id === inscripcion.sesionTallerId);
  try {
    const envio = await enviosClient.enviarReconocimientos({
      taller: sesion ? sesion.titulo : inscripcion.taller,
      fecha: sesion ? sesion.fecha : inscripcion.fecha,
      participantes: [{ nombre: inscripcion.nombre, email: inscripcion.correo }],
    });
    const resultado = (envio.resultados || [])[0];
    if (!resultado || resultado.estado !== 'enviado') {
      return res.status(502).json({ error: (resultado && resultado.error) || 'No se pudo mandar el reconocimiento.' });
    }
    const item = store.marcarReconocimientoEnviado(inscripcion.id, resultado.folio);
    res.json(item);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

module.exports = router;
