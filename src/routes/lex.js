// Portal de Lex (Fase 1): ver los talleres por sede, entrar a cada uno y
// marcar quien ya liquido su taller y con que forma de pago. Vive aparte de
// /admin (otro codigo de entrada, pantallas mucho mas simples) pero lee y
// escribe la MISMA base de datos — un inscrito que Lex marca como pagado
// aqui es el mismo que se ve en /admin y el mismo que cuenta para el cupo
// del taller en la pagina publica.
const express = require('express');
const store = require('../store');
const { requireLex, checkLexCode } = require('../authLex');

const router = express.Router();

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
  { concepto: 'Ebook', precio: 100 },
  { concepto: 'Reconocimiento', precio: 50 },
  { concepto: CONCEPTO_MEMBRESIA, precio: 100 },
];

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
    }));
  res.json({
    taller: {
      id: sesion.id,
      titulo: sesion.titulo,
      fecha: sesion.fecha,
      horario: sesion.horario,
      sede: sede ? sede.nombre : '',
      precioTotal: sesion.precioTotal,
    },
    inscritos,
    formasPago: FORMAS_PAGO,
    catalogo: CATALOGO,
  });
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

router.post('/api/inscripciones/:id/ventas', requireLex, (req, res) => {
  const { items, formaPago } = req.body || {};
  if (formaPago !== undefined && formaPago !== '' && !FORMAS_PAGO.includes(formaPago)) {
    return res.status(400).json({ error: 'Forma de pago no válida.' });
  }
  const item = store.agregarVentaExtraInscripcion(req.params.id, { items, formaPago });
  if (!item) return res.status(400).json({ error: 'Agrega al menos un artículo con nombre.' });
  const huboMembresia = Array.isArray(items) && items.some((it) => it.concepto === CONCEPTO_MEMBRESIA);
  const membresia = intentarActivarMembresia(item.correo, huboMembresia);
  res.json({ ...item, membresia });
});

router.delete('/api/inscripciones/:id/ventas/:ventaId', requireLex, (req, res) => {
  const item = store.borrarVentaExtraInscripcion(req.params.id, req.params.ventaId);
  if (!item) return res.status(404).json({ error: 'No encontrado' });
  res.json(item);
});

module.exports = router;
