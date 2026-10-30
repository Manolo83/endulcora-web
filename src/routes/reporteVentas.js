// Lectura de ventas e inscripciones para decidir presupuesto de anuncios,
// protegida con un token propio igual que el panel de Google Ads.
//
// SOLO LECTURA: aqui no hay ninguna ruta que escriba, borre ni cambie nada.
//
// SIN DATOS PERSONALES, A PROPOSITO. Para decidir cuanto dinero va a cada
// campaña hacen falta conteos, montos, origen y fechas — nunca el nombre, el
// correo ni el telefono de quien compro. Esos datos no salen de aqui: los
// clientes no dieron permiso para que viajaran a ningun lado, y si el token
// se filtra lo unico que se expone son numeros agregados. Quien necesite ver
// a una persona entra a /admin, que para eso pide contraseña.
//
// Se activa definiendo REPORTE_VENTAS_TOKEN en las variables del servidor; si
// no esta definida, estas rutas contestan 503 y no hacen nada.
const express = require('express');
const crypto = require('crypto');
const store = require('../store');
const origenTrafico = require('../origenTrafico');

const router = express.Router();
const TOKEN = process.env.REPORTE_VENTAS_TOKEN || '';

// Comparacion en tiempo constante: evita adivinar el token midiendo cuanto
// tarda la respuesta.
function tokenValido(recibido) {
  if (!TOKEN || !recibido) return false;
  const a = Buffer.from(String(recibido));
  const b = Buffer.from(TOKEN);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  if (!TOKEN) {
    return res.status(503).json({
      error: 'El reporte de ventas no esta activado. Define REPORTE_VENTAS_TOKEN en las variables del servidor.',
    });
  }
  const cabecera = req.get('authorization') || '';
  const recibido = cabecera.startsWith('Bearer ') ? cabecera.slice(7).trim() : req.get('x-reporte-token');
  if (!tokenValido(recibido)) return res.status(401).json({ error: 'Token invalido.' });
  next();
});

// Rango de fechas: ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD. Por defecto, 14 dias.
function rango(req) {
  const hasta = req.query.hasta ? new Date(`${req.query.hasta}T23:59:59.999Z`) : new Date();
  const desde = req.query.desde
    ? new Date(`${req.query.desde}T00:00:00.000Z`)
    : new Date(hasta.getTime() - 14 * 24 * 60 * 60 * 1000);
  return { desde, hasta };
}

function dentro(iso, { desde, hasta }) {
  const t = new Date(iso).getTime();
  return t >= desde.getTime() && t <= hasta.getTime();
}

// Que se vendio, sin decir a quien.
function tipoDePedido(order) {
  const tipos = new Set((order.items || []).map((i) => i.tipo).filter(Boolean));
  if (tipos.has('taller')) return 'taller';
  if (tipos.has('clase_en_vivo')) return 'clase_en_vivo';
  if (tipos.has('producto')) return 'ebook';
  return [...tipos][0] || 'otro';
}

function contar(lista, clave) {
  return lista.reduce((acc, x) => {
    const k = clave(x) || 'sin_dato';
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
}

router.get('/ventas', (req, res) => {
  const r = rango(req);
  const pedidos = store.getOrders().filter((o) => dentro(o.createdAt, r));
  const pagados = pedidos.filter((o) => o.estado === 'aprobado');

  // El detalle va sin correo, sin nombre y sin telefono: solo lo que sirve
  // para decidir presupuesto.
  const detalle = pedidos.map((o) => ({
    id: o.id,
    fecha: o.createdAt,
    estado: o.estado,
    total: Number(o.total) || 0,
    tipo: tipoDePedido(o),
    origen: origenTrafico.origenDe(o).clave,
    titulos: (o.items || []).map((i) => i.titulo).filter(Boolean),
  }));

  res.json({
    rango: { desde: r.desde.toISOString(), hasta: r.hasta.toISOString() },
    totales: {
      pedidos: pedidos.length,
      pagados: pagados.length,
      ingreso_pagado: pagados.reduce((s, o) => s + (Number(o.total) || 0), 0),
    },
    pagados_por_origen: contar(pagados, (o) => origenTrafico.origenDe(o).clave),
    pagados_por_tipo: contar(pagados, tipoDePedido),
    por_estado: contar(pedidos, (o) => o.estado),
    detalle,
  });
});

router.get('/inscripciones', (req, res) => {
  const r = rango(req);
  const sesiones = new Map(store.getSesionesTaller().map((s) => [s.id, s]));
  const inscripciones = store.getInscripcionesTaller().filter((i) => dentro(i.createdAt, r));

  // Agrupadas por taller: cuantos apartaron, cuantos pagaron y de donde
  // llegaron. Ni un nombre.
  const porTaller = {};
  inscripciones.forEach((i) => {
    const sesion = sesiones.get(i.sesionTallerId);
    const clave = `${i.fecha || (sesion && sesion.fecha) || 'sin-fecha'} · ${i.taller || (sesion && sesion.titulo) || 'sin-titulo'}`;
    if (!porTaller[clave]) {
      porTaller[clave] = {
        sede: i.sede || (sesion && sesion.sedeId) || '',
        cupo_maximo: (sesion && sesion.cupoMaximo) || null,
        cupo_restante: sesion && typeof sesion.cupoRestante === 'number' ? sesion.cupoRestante : null,
        inscritos: 0,
        pagados: 0,
        pendientes: 0,
        origen: {},
        como_dicen_que_se_enteraron: {},
      };
    }
    const g = porTaller[clave];
    g.inscritos += 1;
    if (i.estadoPago === 'pagado') g.pagados += 1;
    else if (i.estadoPago === 'pendiente') g.pendientes += 1;
    const o = origenTrafico.origenDe(i).clave;
    g.origen[o] = (g.origen[o] || 0) + 1;
    const dice = i.comoSeEntero || 'sin respuesta';
    g.como_dicen_que_se_enteraron[dice] = (g.como_dicen_que_se_enteraron[dice] || 0) + 1;
  });

  res.json({
    rango: { desde: r.desde.toISOString(), hasta: r.hasta.toISOString() },
    totales: {
      inscritos: inscripciones.length,
      pagados: inscripciones.filter((i) => i.estadoPago === 'pagado').length,
    },
    por_origen: contar(inscripciones, (i) => origenTrafico.origenDe(i).clave),
    por_taller: porTaller,
  });
});

// Como va el correo de "no terminaste de pagar": cuantos salieron y a
// cuantos de esos se les aprobo el pedido despues.
router.get('/recuperacion', (req, res) => {
  res.json(require('../recuperarPagosTaller').resumen());
});

// Como va la master class: cuanta gente se registro y, sobre todo, cuantas
// fichas de acceso anticipado se pagaron. Los registros no llenan la sala
// — las fichas si — asi que es el numero con el que se decide si subir o
// bajar el presupuesto de esa campaña.
//
// Igual que el resto del archivo: solo conteos. Ni un nombre, ni un correo,
// ni un telefono.
router.get('/masterclass', (req, res) => {
  const acceso = require('../accesoAnticipado');
  const contenido = store.getContent();
  const fecha = String(req.query.fecha || contenido.clasegratis_fecha || '').trim();
  const todos = store.getRegistrosClaseGratis();
  const registros = fecha ? todos.filter((r) => r.fecha === fecha) : todos;
  const cupo = store.cupoClaseGratisPorHorario();
  const ahora = new Date();

  const pagado = (r) => r.accesoEstado === 'pagado';
  const apartadoVigente = (r) => r.accesoEstado === 'apartado'
    && r.accesoApartadoHasta && new Date(r.accesoApartadoHasta) > ahora;

  const porHorario = {};
  registros.forEach((r) => {
    const h = r.horario || 'sin-horario';
    if (!porHorario[h]) porHorario[h] = { registros: 0, fichas_pagadas: 0, online_pagado: 0, apartadas: 0, quedan: cupo };
    const g = porHorario[h];
    g.registros += 1;
    if (pagado(r) && r.accesoTipo === 'presencial') g.fichas_pagadas += 1;
    else if (pagado(r) && r.accesoTipo === 'online') g.online_pagado += 1;
    if (apartadoVigente(r)) g.apartadas += 1;
    g.quedan = Math.max(0, cupo - g.fichas_pagadas - g.apartadas);
  });

  const porDia = {};
  registros.forEach((r) => {
    const d = String(r.createdAt || '').slice(0, 10) || 'sin-fecha';
    porDia[d] = (porDia[d] || 0) + 1;
  });

  const fichas = registros.filter((r) => pagado(r) && r.accesoTipo === 'presencial');
  const online = registros.filter((r) => pagado(r) && r.accesoTipo === 'online');

  res.json({
    fecha,
    titulo: contenido.clasegratis_titulo || '',
    registro_abierto: acceso.registroAbierto(contenido),
    precio_acceso: acceso.precioAcceso(contenido),
    cupo_por_horario: cupo,
    aforo_total: cupo * Object.keys(porHorario).length,
    totales: {
      registros: registros.length,
      fichas_presenciales_pagadas: fichas.length,
      acceso_online_pagado: online.length,
      apartados_sin_pagar: registros.filter(apartadoVigente).length,
      ingreso_acceso: registros.filter(pagado).reduce((s, r) => s + (Number(r.accesoMonto) || 0), 0),
      // Cuantos de los registrados acaban comprando su acceso: el numero
      // que dice si la campaña trae gente que de verdad va a ir.
      conversion_registro_a_pago: registros.length
        ? Number(((fichas.length + online.length) / registros.length * 100).toFixed(2))
        : 0,
    },
    de_mexico: registros.filter((r) => r.esDeMexico).length,
    del_extranjero: registros.filter((r) => !r.esDeMexico).length,
    por_horario: porHorario,
    registros_por_dia: porDia,
  });
});

module.exports = router;
