// Promocion "El Buen Fin llego antes" (/buen-fin): pagina exclusiva para la
// Comunidad Endulcora, sin link en el menu. Solo los PDFs de los eBooks (sin
// paquetes ni anexos): 1 eBook por $100 o 4 por $200, y se pueden repetir
// paquetes de 4. Regla literal acordada con el dueño: cada 4 cuestan el
// precio del paquete y los sueltos que sobran cuestan el precio unitario
// cada uno (3 eBooks = $300). La pagina empuja a completar el paquete.
const path = require('path');
const fs = require('fs');
const store = require('./store');
const { UPLOAD_DIR } = require('./config');

const OFFSET_CDMX = '-06:00';

function numero(valor, porDefecto) {
  const n = parseFloat(String(valor || '').replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : porDefecto;
}

function configPromo(contenido = store.getContent()) {
  return {
    precioUno: numero(contenido.buenfin_precio_uno, 100),
    precioPaquete: numero(contenido.buenfin_precio_paquete, 200),
    fin: fechaCDMX(contenido.buenfin_fin),
    inicio: fechaCDMX(contenido.buenfin_inicio),
    activo: contenido.buenfin_activo === 'true',
  };
}

// AAAA-MM-DDTHH:MM en hora de CDMX (CDMX no tiene horario de verano).
function fechaCDMX(valor) {
  const v = String(valor || '').trim();
  if (!v) return null;
  const fecha = new Date(`${v.length === 16 ? `${v}:00` : v}${OFFSET_CDMX}`);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

// Abierta = activa en /admin, ya empezo (si tiene inicio) y no ha
// terminado. Al pasar la fecha de fin se apaga sola.
function promoAbierta(contenido = store.getContent(), ahora = new Date()) {
  const c = configPromo(contenido);
  if (!c.activo || !c.fin) return false;
  if (c.inicio && ahora < c.inicio) return false;
  return ahora < c.fin;
}

// Solo eBooks individuales con su PDF subido: nada de paquetes, anexos ni
// productos ocultos del catalogo.
function ebooksPromo() {
  return store
    .getProducts()
    .filter((p) => p.categoria === 'ebook' && !p.esPaquete && !p.ocultoEnCatalogo && p.archivo)
    .filter((p) => path.extname(p.archivo).toLowerCase() === '.pdf' && fs.existsSync(path.join(UPLOAD_DIR, path.basename(p.archivo))));
}

function calcularTotal(cantidad, c = configPromo()) {
  const paquetes = Math.floor(cantidad / 4);
  const sueltos = cantidad % 4;
  return { paquetes, sueltos, total: paquetes * c.precioPaquete + sueltos * c.precioUno };
}

// Precio de cada eBook dentro del pedido (para Mercado Pago, Ventas y el
// correo): los que entran en paquetes de 4 cuestan precioPaquete / 4 y los
// sueltos el precio unitario. La suma siempre da exactamente el total.
function repartirPrecios(cantidad, c = configPromo()) {
  const { paquetes } = calcularTotal(cantidad, c);
  const enPaquete = paquetes * 4;
  const porLibroPaquete = Math.round((c.precioPaquete / 4) * 100) / 100;
  const precios = [];
  for (let i = 0; i < cantidad; i++) precios.push(i < enPaquete ? porLibroPaquete : c.precioUno);
  // Ajuste de centavos si el precio del paquete no se divide exacto entre 4.
  const esperado = calcularTotal(cantidad, c).total;
  const suma = precios.reduce((a, b) => a + b, 0);
  if (precios.length && Math.abs(esperado - suma) > 0.001) precios[0] = Math.round((precios[0] + esperado - suma) * 100) / 100;
  return precios;
}

// Compras aprobadas de la promo (prueba social real en la pagina y resumen
// del admin).
function resumenVentas() {
  const pedidos = store.getOrders ? store.getOrders().filter((o) => o.promo === 'buen-fin' && o.estado === 'aprobado') : [];
  const delCorreo = pedidos.filter((o) => o.promoOrigen === 'correo');
  return {
    comprasCorreo: delCorreo.length,
    ingresoCorreo: delCorreo.reduce((acc, o) => acc + (Number(o.total) || 0), 0),
    compras: pedidos.length,
    ebooks: pedidos.reduce((acc, o) => acc + (o.items || []).length, 0),
    ingreso: pedidos.reduce((acc, o) => acc + (Number(o.total) || 0), 0),
  };
}

module.exports = { configPromo, promoAbierta, ebooksPromo, calcularTotal, repartirPrecios, resumenVentas, fechaCDMX };

// ---- Correo de la promocion a la comunidad ----
// Precio normal mas comun entre los eBooks de la promo (el "Antes $200").
function precioNormalTipico(ebooks = ebooksPromo()) {
  const conteo = {};
  ebooks.forEach((e) => {
    const p = parseFloat(String(e.precio || '').replace(/[^0-9.]/g, ''));
    if (p) conteo[p] = (conteo[p] || 0) + 1;
  });
  const top = Object.entries(conteo).sort((a, b) => b[1] - a[1])[0];
  return top ? Number(top[0]) : 200;
}

// Los eBooks de la promo mas vendidos (todas las compras pagadas, no solo
// las de la promo); si hay pocos datos se completa en orden del catalogo.
function masVendidos(n = 4) {
  const ebooks = ebooksPromo();
  const ventas = new Map();
  (store.getOrders ? store.getOrders() : [])
    .filter((o) => o.estado === 'aprobado')
    .forEach((o) => (o.items || []).forEach((i) => {
      if (i.tipo === 'producto') ventas.set(Number(i.itemId), (ventas.get(Number(i.itemId)) || 0) + (Number(i.cantidad) || 1));
    }));
  return ebooks
    .map((e, orden) => ({ e, orden, v: ventas.get(e.id) || 0 }))
    .sort((a, b) => b.v - a.v || a.orden - b.orden)
    .slice(0, n)
    .map((x) => x.e);
}

// Correos que ya compraron en la promocion (no se les vuelve a mandar).
function correosQueYaCompraron() {
  return new Set(
    (store.getOrders ? store.getOrders() : [])
      .filter((o) => o.promo === 'buen-fin' && o.estado === 'aprobado' && o.email)
      .map((o) => String(o.email).trim().toLowerCase())
  );
}

// A quien le llega: solo contactos que de verdad interactuaron en
// endulcora.com (cuenta, compra, suscripcion, registro a clase o taller),
// menos quien se dio de baja y quien ya compro en la promocion. Los que solo
// llegaron por una importacion de CSV no reciben este correo.
function audienciaCorreo() {
  const contactos = store.getContactosCampana();
  const interaccion = store.correosConInteraccion();
  const compraron = correosQueYaCompraron();
  const delSitio = contactos.filter((c) => interaccion.has(c.email));
  const activos = delSitio.filter((c) => c.activo !== false);
  const destinatarios = activos.filter((c) => !compraron.has(c.email));
  return {
    contactos: contactos.length,
    sinInteraccion: contactos.length - delSitio.length,
    bajas: delSitio.length - activos.length,
    yaCompraron: activos.length - destinatarios.length,
    destinatarios,
  };
}

module.exports.precioNormalTipico = precioNormalTipico;
module.exports.masVendidos = masVendidos;
module.exports.correosQueYaCompraron = correosQueYaCompraron;
module.exports.audienciaCorreo = audienciaCorreo;

// Datos del correo con los precios y la fecha vigentes al momento de mandar
// (si se mueve el precio o la fecha en /admin, el correo sale actualizado).
// ebookIds: los que se eligieron al crear el envio; los que ya salieron de
// la promocion se omiten.
function datosCorreo(ebookIds) {
  const { SITE_URL } = require('./config');
  const contenido = store.getContent();
  const c = configPromo(contenido);
  const todos = ebooksPromo();
  const porId = new Map(todos.map((e) => [e.id, e]));
  const elegidos = (ebookIds || masVendidos(4).map((e) => e.id)).map((id) => porId.get(Number(id))).filter(Boolean);
  return {
    siteUrl: SITE_URL,
    precioUno: c.precioUno,
    precioPaquete: c.precioPaquete,
    precioNormal: precioNormalTipico(todos),
    fin: c.fin,
    whatsapp: contenido.whatsapp_numero || '',
    ebooks: elegidos.map((e) => ({ id: e.id, titulo: e.titulo, imagen: e.imagen || '' })),
  };
}

function asuntoCorreo(c = configPromo()) {
  return `LLEGÓ EL BUEN FIN A ENDULCORA 🎉 Tus eBooks desde $${Math.round((c.precioPaquete / 4) * 100) / 100}`;
}

module.exports.datosCorreo = datosCorreo;
module.exports.asuntoCorreo = asuntoCorreo;
