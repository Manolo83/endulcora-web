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
  return {
    compras: pedidos.length,
    ebooks: pedidos.reduce((acc, o) => acc + (o.items || []).length, 0),
    ingreso: pedidos.reduce((acc, o) => acc + (Number(o.total) || 0), 0),
  };
}

module.exports = { configPromo, promoAbierta, ebooksPromo, calcularTotal, repartirPrecios, resumenVentas, fechaCDMX };
