const express = require('express');
const crypto = require('crypto');
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
const store = require('../store');
const { SITE_URL } = require('../config');
const { enviarCorreoConfirmacionPagoTaller } = require('../email');
const { enviarPurchaseCAPI } = require('../metaConversions');
const { enviarCompraGoogle } = require('../googleAds/conversiones');
const { avisarEquipoNuevoTaller, sincronizarInscripcionTaller } = require('../automatizacionesTaller');
const bcrypt = require('bcryptjs');
const acceso = require('../accesoAnticipado');
const promoBuenFin = require('../promoBuenFin');
const entregas = require('../entregas');
const { enviarCorreoAccesoConfirmado } = require('../email');

const router = express.Router();

const MAX_ARTICULOS = 15;
const MAX_CANTIDAD_POR_ARTICULO = 20;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WHATSAPP_RE = /^[0-9+\s()-]{7,20}$/;
// Mientras se espera el pago en OXXO/SPEI, el lugar queda apartado (cuenta
// para el cupo) este tiempo. Si no se paga, se libera solo.
const HORAS_VENCE_PENDIENTE_TALLER = 72;

function mpClient() {
  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) return null;
  return new MercadoPagoConfig({ accessToken });
}

function parsePrecio(valor) {
  const numero = parseFloat(String(valor).replace(/,/g, ''));
  return Number.isFinite(numero) ? numero : 0;
}

router.post('/preference', async (req, res) => {
  const client = mpClient();
  if (!client) return res.status(503).json({ error: 'Los pagos todavia no estan configurados.' });

  const { items: pedido, email, fbp, fbc, gclid, gbraid, wbraid } = req.body || {};
  if (!Array.isArray(pedido) || pedido.length === 0) {
    return res.status(400).json({ error: 'Tu carrito esta vacio.' });
  }
  if (pedido.length > MAX_ARTICULOS) {
    return res.status(400).json({ error: 'Demasiados artículos distintos en un solo pedido.' });
  }

  const userId = req.session && req.session.userId ? req.session.userId : null;
  const usuario = userId ? store.getUserById(userId) : null;
  const esMiembroActivo = !!(usuario && usuario.membresiaEstado === 'activa');

  const resueltos = [];
  for (const linea of pedido) {
    if (linea.tipo === 'clase_en_vivo') {
      if (!userId) return res.status(401).json({ error: 'Inicia sesión para comprar tu acceso a la clase en vivo.' });
      const contenido = store.getContent();
      if (contenido.clase_cobro_activo !== 'true') {
        return res.status(400).json({ error: 'La clase en vivo no tiene cobro activo en este momento.' });
      }
      const claseFecha = store.proximaFechaClaseEnVivo(contenido.clase_dia_semana, contenido.clase_hora);
      if (store.tieneAccesoClaseEnVivo({ fecha: claseFecha, userId })) {
        return res.status(400).json({ error: 'Ya tienes acceso a esta clase.' });
      }
      const precio = esMiembroActivo ? parsePrecio(contenido.clase_precio_miembro) : parsePrecio(contenido.clase_precio_normal);
      if (precio <= 0) continue;
      resueltos.push({
        tipo: 'clase_en_vivo',
        itemId: null,
        titulo: `Acceso a la clase en vivo del ${claseFecha}`,
        precio,
        cantidad: 1,
        claseFecha,
      });
      continue;
    }
    if (linea.tipo === 'taller') {
      const sesionTallerId = Number(linea.sesionTallerId);
      const tipoPago = linea.tipoPago === 'completo' ? 'completo' : 'anticipo';
      const nombre = String(linea.nombre || '').trim();
      const whatsapp = String(linea.whatsapp || '').trim();
      if (!sesionTallerId || !nombre) {
        return res.status(400).json({ error: 'Faltan tus datos para apartar el taller.' });
      }
      if (!WHATSAPP_RE.test(whatsapp)) {
        return res.status(400).json({ error: 'Escribe un número de WhatsApp válido.' });
      }
      if (!EMAIL_RE.test(String(email || ''))) {
        return res.status(400).json({ error: 'Escribe un correo válido.' });
      }
      if (linea.esDeMexico && !store.ESTADOS_MEXICO.includes(linea.estado)) {
        return res.status(400).json({ error: 'Elige tu estado de la lista.' });
      }
      if (linea.esDeMexico === false && !String(linea.pais || '').trim()) {
        return res.status(400).json({ error: 'Escribe de qué país te registras.' });
      }
      if (!linea.aceptaAvisoPrivacidad) {
        return res.status(400).json({ error: 'Tienes que aceptar el aviso de privacidad para apartar tu lugar.' });
      }
      const sesion = store.getSesionesTaller().find((s) => s.id === sesionTallerId);
      if (!sesion) return res.status(404).json({ error: 'Ese taller ya no está disponible.' });
      if (sesion.fecha && sesion.fecha < new Date().toISOString().slice(0, 10)) {
        return res.status(400).json({ error: 'Ese taller ya se realizó.' });
      }
      if (sesion.estado === 'agotado' || sesion.cupoRestante === 0) {
        return res.status(400).json({ error: 'Ese taller ya no tiene lugares disponibles.' });
      }
      const precio = tipoPago === 'completo' ? parsePrecio(sesion.precioTotal) : parsePrecio(sesion.anticipo);
      if (precio <= 0) {
        return res.status(400).json({ error: 'Ese taller todavía no tiene precio configurado. Escríbenos por WhatsApp.' });
      }
      const sedeInfo = store.getSedes().find((s) => s.id === sesion.sedeId);
      // Se crea la inscripcion desde ahora, "pendiente", para que cuente en
      // el cupo mientras se espera el pago (sobre todo OXXO/SPEI, que
      // tardan dias): si no se paga a tiempo, se libera sola (ver
      // cupoRestanteTaller en store.js).
      const vencePendienteEn = new Date(Date.now() + HORAS_VENCE_PENDIENTE_TALLER * 60 * 60 * 1000).toISOString();
      const inscripcion = store.addInscripcionTaller({
        nombre,
        whatsapp,
        correo: email,
        sesionTallerId: sesion.id,
        taller: sesion.titulo,
        fecha: sesion.fecha,
        sede: sedeInfo ? sedeInfo.nombre : '',
        horario: sesion.horario || '',
        montoAnticipo: String(precio),
        comoSeEntero: 'Pago en línea (endulcora.com)',
        esDeMexico: linea.esDeMexico,
        estado: linea.estado,
        pais: linea.pais,
        aceptaPromociones: linea.aceptaPromociones,
        aceptaAvisoPrivacidad: linea.aceptaAvisoPrivacidad,
      });
      store.actualizarPagoInscripcionTaller(inscripcion.id, { tipoPago, estadoPago: 'pendiente', vencePendienteEn });
      // Igual que el formulario gratuito: se intenta mandar a "Inscritos
      // 2026" desde que se crea, no hasta que se confirme el pago — asi
      // Lex ve ahi tambien a quien ya empezo a pagar. El barrido de cada
      // 30 min reintenta si esto falla.
      sincronizarInscripcionTaller(store.getInscripcionTaller(inscripcion.id)).catch((err) => {
        console.error(`[checkout] No se pudo sincronizar con Google Sheets la inscripcion ${inscripcion.id}:`, err.message);
      });
      resueltos.push({
        tipo: 'taller',
        itemId: sesion.id,
        titulo: `${tipoPago === 'completo' ? 'Pago completo' : 'Anticipo'}: ${sesion.titulo} (${sesion.fecha})`,
        precio,
        cantidad: 1,
        sesionTallerId: sesion.id,
        inscripcionTallerId: inscripcion.id,
        tipoPago,
      });
      continue;
    }
    if (!['producto', 'curso'].includes(linea.tipo) || !linea.id) {
      return res.status(400).json({ error: 'Uno de los artículos del carrito no es valido.' });
    }
    const cantidad = Math.max(1, Math.min(MAX_CANTIDAD_POR_ARTICULO, parseInt(linea.cantidad, 10) || 1));
    const item = linea.tipo === 'producto' ? store.getProduct(linea.id) : store.getCurso(linea.id);
    if (!item) {
      return res.status(404).json({ error: `"${linea.titulo || 'Un artículo'}" ya no esta disponible.` });
    }
    if (linea.tipo === 'producto' && !entregas.sePuedeEntregar(item)) {
      console.error(`[checkout] Se intentó comprar "${item.titulo}" (producto ${item.id}) pero no tiene archivo: hay que subirlo en /admin.`);
      return res.status(409).json({ error: `"${item.titulo}" no está disponible por el momento. Quítalo del carrito o escríbenos por WhatsApp.` });
    }
    // El precio de membresia (si el producto tiene uno) solo se usa cuando
    // la sesion actual es realmente de un cliente con membresia activa —
    // nunca se confia en nada que mande el carrito del navegador.
    const usarPrecioMiembro = esMiembroActivo && item.precioMembresia && parsePrecio(item.precioMembresia) > 0;
    const precio = usarPrecioMiembro ? parsePrecio(item.precioMembresia) : parsePrecio(item.precio);
    if (precio <= 0) continue;
    resueltos.push({ tipo: linea.tipo, itemId: item.id, titulo: item.titulo, precio, cantidad });
  }

  if (!resueltos.length) {
    return res.status(400).json({ error: 'No hay artículos validos en tu carrito.' });
  }

  const total = resueltos.reduce((acc, r) => acc + r.precio * r.cantidad, 0);
  const viewToken = crypto.randomBytes(24).toString('hex');
  const order = store.addOrder({
    items: resueltos,
    total,
    email: email || (usuario ? usuario.email : ''),
    userId,
    viewToken,
    fbp: typeof fbp === 'string' ? fbp.slice(0, 200) : null,
    fbc: typeof fbc === 'string' ? fbc.slice(0, 200) : null,
    // Identificadores del clic en un anuncio de Google (gclid en buscador y
    // display; gbraid/wbraid cuando el clic viene de una app o de iOS).
    gclid: typeof gclid === 'string' ? gclid.slice(0, 200) : null,
    gbraid: typeof gbraid === 'string' ? gbraid.slice(0, 200) : null,
    wbraid: typeof wbraid === 'string' ? wbraid.slice(0, 200) : null,
  });

  try {
    const preference = new Preference(client);
    const resultado = await preference.create({
      body: {
        items: resueltos.map((r) => ({
          id: String(r.itemId),
          title: r.titulo,
          quantity: r.cantidad,
          unit_price: r.precio,
          currency_id: 'MXN',
        })),
        payer: email ? { email } : undefined,
        external_reference: String(order.id),
        back_urls: {
          success: `${SITE_URL}/gracias?orden=${order.id}&token=${viewToken}`,
          failure: `${SITE_URL}/?pago=error`,
          pending: `${SITE_URL}/gracias?orden=${order.id}&token=${viewToken}`,
        },
        auto_return: 'approved',
        notification_url: `${SITE_URL}/api/checkout/webhook`,
      },
    });

    store.updateOrder(order.id, { mpPreferenceId: resultado.id });
    // Mercado Pago devuelve tanto init_point como sandbox_init_point sin
    // importar el tipo de credencial usada, asi que no se puede adivinar
    // cual corresponde. Se usa init_point (el real) siempre, salvo que se
    // active explicitamente MP_SANDBOX=true en las variables de entorno
    // (util solo mientras se prueba con credenciales de prueba).
    const usarSandbox = process.env.MP_SANDBOX === 'true';
    const url = usarSandbox ? (resultado.sandbox_init_point || resultado.init_point) : resultado.init_point;
    res.status(201).json({ url });
  } catch (err) {
    store.updateOrder(order.id, { estado: 'error' });
    res.status(502).json({ error: 'No se pudo iniciar el pago. Intenta de nuevo en un momento.' });
  }
});

// ---- Promocion "El Buen Fin llego antes" (/buen-fin) ----
// El precio lo calcula siempre el servidor con la regla de la promo; el
// pedido queda como cualquier compra de productos, asi que las descargas,
// el correo con los links, Ventas y la medicion funcionan igual que siempre.
router.post('/buen-fin', async (req, res) => {
  const client = mpClient();
  if (!client) return res.status(503).json({ error: 'Los pagos todavía no están configurados.' });
  const contenido = store.getContent();
  if (!promoBuenFin.promoAbierta(contenido)) {
    return res.status(400).json({ error: 'Esta promoción ya terminó.' });
  }
  const { ids, email, origen, fbp, fbc, gclid, gbraid, wbraid } = req.body || {};
  const correo = String(email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(correo)) return res.status(400).json({ error: 'Escribe tu correo: ahí te mandamos tus eBooks.' });
  const pedidos = Array.isArray(ids) ? [...new Set(ids.map(Number))] : [];
  if (!pedidos.length) return res.status(400).json({ error: 'Elige al menos un eBook.' });
  if (pedidos.length > 200) return res.status(400).json({ error: 'Demasiados eBooks en un solo pedido.' });
  const disponibles = new Map(promoBuenFin.ebooksPromo().map((p) => [p.id, p]));
  const libros = pedidos.map((id) => disponibles.get(id));
  if (libros.some((l) => !l)) return res.status(400).json({ error: 'Uno de los eBooks que elegiste ya no está en la promoción. Recarga la página.' });

  const c = promoBuenFin.configPromo(contenido);
  const precios = promoBuenFin.repartirPrecios(libros.length, c);
  const { total, paquetes, sueltos } = promoBuenFin.calcularTotal(libros.length, c);
  const resueltos = libros.map((p, i) => ({ tipo: 'producto', itemId: p.id, titulo: p.titulo, precio: precios[i], cantidad: 1 }));
  const userId = req.session && req.session.userId ? req.session.userId : null;
  const viewToken = crypto.randomBytes(24).toString('hex');
  const order = store.addOrder({
    items: resueltos,
    total,
    email: correo,
    userId,
    viewToken,
    fbp: typeof fbp === 'string' ? fbp.slice(0, 200) : null,
    fbc: typeof fbc === 'string' ? fbc.slice(0, 200) : null,
    gclid: typeof gclid === 'string' ? gclid.slice(0, 200) : null,
    gbraid: typeof gbraid === 'string' ? gbraid.slice(0, 200) : null,
    wbraid: typeof wbraid === 'string' ? wbraid.slice(0, 200) : null,
  });
  // origen 'correo': llego desde el correo a la comunidad (para saber
  // cuantas ventas trajo el correo y cuantas WhatsApp).
  const promoOrigen = origen === 'correo' ? 'correo' : '';
  store.updateOrder(order.id, { promo: c.slug, promoDetalle: { paquetes, sueltos }, promoOrigen });
  try {
    const resultado = await new Preference(client).create({
      body: {
        items: resueltos.map((r) => ({ id: String(r.itemId), title: `${r.titulo} (${c.nombre})`, quantity: 1, unit_price: r.precio, currency_id: 'MXN' })),
        payer: { email: correo },
        external_reference: String(order.id),
        back_urls: {
          success: `${SITE_URL}/gracias?orden=${order.id}&token=${viewToken}`,
          failure: `${SITE_URL}/${c.slug}?pago=error`,
          pending: `${SITE_URL}/gracias?orden=${order.id}&token=${viewToken}`,
        },
        auto_return: 'approved',
        notification_url: `${SITE_URL}/api/checkout/webhook`,
      },
    });
    store.updateOrder(order.id, { mpPreferenceId: resultado.id });
    const usarSandbox = process.env.MP_SANDBOX === 'true';
    const url = usarSandbox ? (resultado.sandbox_init_point || resultado.init_point) : resultado.init_point;
    res.status(201).json({ url, total });
  } catch (err) {
    store.updateOrder(order.id, { estado: 'error' });
    res.status(502).json({ error: 'No se pudo iniciar el pago. Intenta de nuevo en un momento.' });
  }
});

// ---- Acceso anticipado de la master class (ver src/accesoAnticipado.js) ----
// Solo desde el link personal del registro (id + token). El mes de
// membresia va a la cuenta de endulcora.com con el correo del registro: si
// no existe se crea aqui (pide contraseña), y si existe pide entrar.
router.post('/acceso-anticipado', async (req, res) => {
  const client = mpClient();
  if (!client) return res.status(503).json({ error: 'Los pagos todavía no están configurados.' });

  const b = req.body || {};
  const registro = store.getRegistroClaseGratisPorToken(b.id, b.token);
  if (!registro) return res.status(404).json({ error: 'No encontramos tu registro. Usa el link de tu correo.' });
  const contenido = store.getContent();
  if (registro.fecha !== contenido.clasegratis_fecha || !acceso.accesoAbierto(contenido)) {
    return res.status(400).json({ error: 'El acceso anticipado para esta master class ya no está disponible.' });
  }
  if (registro.accesoEstado === 'pagado') {
    return res.status(400).json({ error: 'Ya tienes tu acceso anticipado.' });
  }

  // Cuenta de endulcora.com (para su mes de membresia).
  const password = String(b.password || '');
  const sesionUsuario = req.session && req.session.userId ? store.getUserById(req.session.userId) : null;
  let usuario = store.getUserByEmail(registro.correo);
  if (sesionUsuario && usuario && sesionUsuario.id === usuario.id) {
    // Ya entro con la cuenta de este correo.
  } else if (usuario) {
    if (!password || !bcrypt.compareSync(password, usuario.passwordHash)) {
      return res.status(401).json({ error: `Escribe la contraseña de tu cuenta Endulcora (${registro.correo}).`, requiereLogin: true });
    }
    req.session.userId = usuario.id;
  } else {
    if (password.length < 6) {
      return res.status(400).json({ error: 'Crea una contraseña de al menos 6 caracteres para tu cuenta.' });
    }
    usuario = store.addUser({
      email: registro.correo,
      passwordHash: bcrypt.hashSync(password, 10),
      nombre: registro.nombre,
      telefono: String(registro.whatsapp || '').replace(/\D/g, '').slice(-10),
    });
    req.session.userId = usuario.id;
  }

  const pago = acceso.prepararPago(registro.id);
  const presencial = pago.tipo === 'presencial';
  const precio = acceso.precioAcceso(contenido);
  const titulo = `${presencial ? 'Acceso anticipado presencial' : 'Acceso anticipado en línea'}: ${contenido.clasegratis_titulo || 'Master class'} (${registro.horario})`;
  const viewToken = crypto.randomBytes(24).toString('hex');
  const order = store.addOrder({
    items: [{ tipo: 'acceso_anticipado', itemId: registro.id, titulo, precio, cantidad: 1, registroClaseGratisId: registro.id, accesoTipo: pago.tipo }],
    total: precio,
    email: registro.correo,
    userId: usuario.id,
    viewToken,
  });
  store.updateRegistroClaseGratis(registro.id, { accesoOrderId: order.id });

  const vuelta = `${SITE_URL}/acceso-anticipado?id=${registro.id}&token=${registro.confirmToken}`;
  const body = {
    items: [{ id: `acceso-${registro.id}`, title: titulo, quantity: 1, unit_price: precio, currency_id: 'MXN' }],
    payer: { email: registro.correo },
    external_reference: String(order.id),
    back_urls: { success: `${vuelta}&pago=1`, pending: `${vuelta}&pago=1`, failure: `${vuelta}&pago=error` },
    auto_return: 'approved',
    notification_url: `${SITE_URL}/api/checkout/webhook`,
  };
  // La ficha queda apartada solo 30 minutos: para la presencial no se
  // aceptan pagos que tardan dias (OXXO, transferencia) y la liga de pago
  // vence junto con el apartado. El acceso en linea acepta todo.
  if (presencial) {
    body.payment_methods = { excluded_payment_types: [{ id: 'ticket' }, { id: 'atm' }, { id: 'bank_transfer' }] };
    body.expires = true;
    body.expiration_date_to = new Date(pago.apartadoHasta).toISOString();
  }
  try {
    const resultado = await new Preference(client).create({ body });
    store.updateOrder(order.id, { mpPreferenceId: resultado.id });
    const usarSandbox = process.env.MP_SANDBOX === 'true';
    const url = usarSandbox ? (resultado.sandbox_init_point || resultado.init_point) : resultado.init_point;
    res.status(201).json({ url, tipo: pago.tipo, apartadoHasta: pago.apartadoHasta });
  } catch (err) {
    store.updateOrder(order.id, { estado: 'error' });
    acceso.liberarApartado(registro.id, order.id);
    res.status(502).json({ error: 'No se pudo iniciar el pago. Intenta de nuevo en un momento.' });
  }
});

function procesarAccesoAnticipadoDelPedido(order, nuevoEstado) {
  const item = (order.items || []).find((i) => i.tipo === 'acceso_anticipado');
  if (!item) return;
  if (nuevoEstado === 'rechazado' || nuevoEstado === 'cancelado') {
    acceso.liberarApartado(item.registroClaseGratisId, order.id);
    return;
  }
  if (nuevoEstado !== 'aprobado') return;
  const resultado = acceso.aplicarPagoAprobado(item.registroClaseGratisId, { monto: item.precio, userId: order.userId });
  const registro = resultado.registro;
  if (!registro || registro.accesoCorreoEnviado) return;
  const contenido = store.getContent();
  enviarCorreoAccesoConfirmado({
    to: registro.correo,
    nombre: registro.nombre,
    titulo: contenido.clasegratis_titulo,
    fecha: registro.fecha,
    horario: registro.horario,
    ubicacion: contenido.clasegratis_ubicacion,
    tipo: registro.accesoTipo,
    numero: registro.numeroInscrito,
    pasoAOnline: registro.accesoPasoAOnline,
    membresiaHasta: resultado.membresiaHasta,
    yaEraMiembro: resultado.yaEraMiembro,
    recetarioUrl: registro.accesoRecetarioUrl,
    recetarioNombre: registro.accesoRecetarioNombre,
    siteUrl: SITE_URL,
    link: acceso.linkAcceso(SITE_URL, registro),
  })
    .then(() => store.updateRegistroClaseGratis(registro.id, { accesoCorreoEnviado: true }))
    .catch((err) => console.error(`[acceso-anticipado] No se pudo mandar el correo de confirmacion a ${registro.correo}:`, err.message));
}

router.post('/webhook', async (req, res) => {
  res.status(200).end();

  const client = mpClient();
  if (!client) return;

  const paymentId = (req.body && req.body.data && req.body.data.id) || req.query.id || req.query['data.id'];
  const topic = req.query.topic || req.query.type || (req.body && req.body.type);
  if (!paymentId || (topic && topic !== 'payment')) return;

  try {
    const payment = new Payment(client);
    const info = await payment.get({ id: paymentId });
    await aplicarPagoAlPedido(info);
  } catch (err) {
    // Si Mercado Pago reintenta despues, se procesa en el proximo intento.
  }
});

// Aplica un pago de Mercado Pago a su pedido (external_reference): estado,
// correo con las descargas, contactos, Meta/Google, talleres y acceso
// anticipado. Lo usa el aviso (webhook) de Mercado Pago y tambien la
// revision de pendientes (src/revisarPagos.js), para que un pedido que se
// recupera haga exactamente lo mismo que uno que llego por el aviso.
async function aplicarPagoAlPedido(info) {
  const orderId = info.external_reference;
  if (!orderId) return null;
  const order = store.getOrder(orderId);
  if (!order) return null;

  const mapaEstado = {
    approved: 'aprobado',
    pending: 'pendiente',
    in_process: 'en_proceso',
    rejected: 'rechazado',
    cancelled: 'cancelado',
    refunded: 'reembolsado',
  };
  const nuevoEstado = mapaEstado[info.status] || info.status;
  const yaSeHabiaAprobado = order.estado === 'aprobado';

  const patch = { estado: nuevoEstado, mpPaymentId: String(info.id) };
  if (nuevoEstado === 'aprobado' && !order.descargaToken) {
    patch.descargaToken = crypto.randomBytes(24).toString('hex');
  }
  const actualizado = store.updateOrder(order.id, patch);

  // Cliente real que pago: se suma a la lista de campañas de correo
  // masivo, sea que tenga cuenta o haya comprado como invitado.
  if (nuevoEstado === 'aprobado' && !yaSeHabiaAprobado && actualizado.email) {
    store.importarContactosCampana([{ email: actualizado.email }]);
  }

  if (nuevoEstado === 'aprobado' && !order.capiPurchaseEnviado) {
    await enviarPurchaseCAPI({ order: actualizado, siteUrl: SITE_URL });
    store.updateOrder(order.id, { capiPurchaseEnviado: true });
  }

  if (nuevoEstado === 'aprobado' && !order.googleAdsEnviado) {
    await enviarCompraGoogle({ order: actualizado });
    store.updateOrder(order.id, { googleAdsEnviado: true });
  }

  if (nuevoEstado === 'aprobado' && !yaSeHabiaAprobado) {
    for (const item of actualizado.items) {
      if (item.tipo !== 'clase_en_vivo' || !item.claseFecha) continue;
      if (store.tieneAccesoClaseEnVivo({ fecha: item.claseFecha, userId: actualizado.userId })) continue;
      store.addAccesoClaseEnVivo({
        fecha: item.claseFecha,
        userId: actualizado.userId,
        email: actualizado.email,
        monto: item.precio,
        orderId: actualizado.id,
      });
    }
  }

  // Acceso anticipado de la master class: ficha (o acceso en linea), mes
  // de membresia y correo con el recetario. Manda su propio correo.
  if (!yaSeHabiaAprobado || nuevoEstado !== 'aprobado') {
    procesarAccesoAnticipadoDelPedido(actualizado, nuevoEstado);
  }

  // Talleres: el pago confirma o libera el lugar que ya se habia
  // reservado como "pendiente" al crear la preferencia (ver /preference).
  if (['aprobado', 'rechazado', 'cancelado'].includes(nuevoEstado)) {
    for (const item of actualizado.items) {
      if (item.tipo !== 'taller' || !item.inscripcionTallerId) continue;
      if (nuevoEstado === 'aprobado') {
        store.actualizarPagoInscripcionTaller(item.inscripcionTallerId, {
          tipoPago: item.tipoPago,
          montoPagado: item.precio,
          estadoPago: 'pagado',
          pagoId: String(info.id),
        });
        // Aviso interno al equipo (si esta configurado) y, cuando ya
        // existan las credenciales, la fila en "Inscritos 2026" — ambos
        // nunca deben tumbar la confirmacion del pago si fallan.
        if (!yaSeHabiaAprobado) {
          const inscripcionPagada = store.getInscripcionTaller(item.inscripcionTallerId);
          if (inscripcionPagada) {
            avisarEquipoNuevoTaller(inscripcionPagada).catch((err) => {
              console.error(`[checkout] No se pudo mandar el aviso al equipo del taller (inscripcion ${inscripcionPagada.id}):`, err.message);
            });
            sincronizarInscripcionTaller(inscripcionPagada).catch((err) => {
              console.error(`[checkout] No se pudo sincronizar con Google Sheets la inscripcion ${inscripcionPagada.id}:`, err.message);
            });
          }
        }
      } else {
        store.actualizarPagoInscripcionTaller(item.inscripcionTallerId, { estadoPago: 'cancelado' });
      }
    }
  }

  const esAccesoAnticipado = actualizado.items.some((item) => item.tipo === 'acceso_anticipado');
  if (nuevoEstado === 'aprobado' && !order.correoEnviado && actualizado.email && !esAccesoAnticipado) {
    const contenido = store.getContent();
    const itemTaller = actualizado.items.find((item) => item.tipo === 'taller' && item.inscripcionTallerId);
    const correoListo = itemTaller
      ? (() => {
          const inscripcion = store.getInscripcionTaller(itemTaller.inscripcionTallerId);
          const sesion = inscripcion ? store.getSesionesTaller().find((s) => s.id === inscripcion.sesionTallerId) : null;
          const sedeInfo = sesion ? store.getSedes().find((s) => s.id === sesion.sedeId) : null;
          return enviarCorreoConfirmacionPagoTaller({
            to: actualizado.email,
            nombre: inscripcion ? inscripcion.nombre : '',
            taller: inscripcion ? inscripcion.taller : '',
            fecha: inscripcion ? inscripcion.fecha : '',
            horario: inscripcion ? inscripcion.horario : '',
            sede: inscripcion ? inscripcion.sede : '',
            direccion: sedeInfo ? sedeInfo.direccion : '',
            mapaLink: sedeInfo ? sedeInfo.mapaLink : '',
            queAprendes: sesion ? sesion.queAprendes : '',
            tipoPago: itemTaller.tipoPago,
            montoPagado: itemTaller.precio,
            saldo: inscripcion ? inscripcion.saldo : null,
            comunidadLink: contenido.comunidad_whatsapp_link || '',
            numeroWhatsapp: contenido.whatsapp_numero,
          });
        })()
      : entregas.mandarCorreoCompra(actualizado);
    correoListo
      .then(() => store.updateOrder(order.id, { correoEnviado: true }))
      .catch((err) => {
        // Si el correo no se pudo enviar (ej. Resend caido), queda marcado y
        // src/entregas.js lo reintenta cada hora; tambien se ve en Ventas.
        entregas.registrarFalloCorreo(store.getOrder(order.id), err);
        console.error(`[checkout] No se pudo enviar el correo de confirmacion del pedido ${order.id}:`, err.message);
      });
  }
  return store.getOrder(order.id);
}

module.exports = router;
module.exports.aplicarPagoAlPedido = aplicarPagoAlPedido;
module.exports.mpClient = mpClient;
