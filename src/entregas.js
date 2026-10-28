// Entrega de archivos comprados (eBooks, recetarios, anexos): todo lo que
// hace falta para que cada cliente tenga sus PDFs desde cualquier telefono,
// tablet o computadora y cualquier app de correo.
//
// - La pagina "Tus eBooks" (src/paginaDescargas.js) con descarga directa,
//   "mandarmelo por correo" (adjunto) y "abrir en el navegador".
// - Reintento automatico del correo de compra si Resend fallo.
// - Revision de archivos para /admin (faltan, no son PDF, muy pesados) y
//   aviso al equipo cuando se vende algo cuyo archivo no esta.
const path = require('path');
const fs = require('fs');
const store = require('./store');
const { UPLOAD_DIR, SITE_URL, EQUIPO_NOTIFICACIONES_EMAIL } = require('./config');

// Hasta este peso el PDF se puede mandar como adjunto (Resend acepta 40MB
// por correo, pero muchos buzones rechazan adjuntos de mas de ~20MB).
const MAX_ADJUNTO_BYTES = 18 * 1024 * 1024;
// Mas de esto tarda mucho en bajar con datos del celular: se avisa en admin.
const PESO_ALTO_BYTES = 40 * 1024 * 1024;
const MAX_ADJUNTOS_POR_LIBRO_DIA = 3;
const MAX_INTENTOS_CORREO = 6;

// Productos que se entregan como archivo (eBooks, recetarios, anexos y
// paquetes completos). Si su archivo no esta, no se ofrecen ni se venden.
function esDigital(producto) {
  return !!producto && (['ebook', 'recetario', 'anexo'].includes(producto.categoria) || producto.esPaquete || !!producto.archivo);
}

function sePuedeEntregar(producto) {
  return !esDigital(producto) || archivoDeProducto(producto).existe;
}

// Estado real del archivo de un producto en el disco.
function archivoDeProducto(producto) {
  if (!producto || !producto.archivo) return { existe: false, bytes: 0, esPdf: false, ruta: '' };
  const filename = path.basename(producto.archivo);
  const ruta = path.join(UPLOAD_DIR, filename);
  try {
    const { size } = fs.statSync(ruta);
    let esPdf = false;
    const fd = fs.openSync(ruta, 'r');
    try {
      const cabeza = Buffer.alloc(1024);
      const leidos = fs.readSync(fd, cabeza, 0, 1024, 0);
      esPdf = cabeza.slice(0, leidos).includes('%PDF-');
    } finally {
      fs.closeSync(fd);
    }
    return { existe: size > 0, bytes: size, esPdf, ruta, filename, extension: path.extname(filename).toLowerCase() };
  } catch (e) {
    return { existe: false, bytes: 0, esPdf: false, ruta, filename };
  }
}

function nombreDescarga(producto, archivo) {
  return producto.archivoNombre || `${producto.titulo || 'archivo'}${archivo.extension || path.extname(producto.archivo || '')}`;
}

function linkEbooks(order) {
  return `${SITE_URL}/api/pedidos/${order.id}/ebooks?token=${encodeURIComponent(order.descargaToken || '')}`;
}

// Articulos del pedido que se entregan como archivo, con su estado.
function archivosDelPedido(order) {
  return (order.items || [])
    .map((item, i) => ({ item, i }))
    .filter(({ item }) => item.tipo === 'producto')
    .map(({ item, i }) => {
      const producto = store.getProduct(item.itemId);
      return { i, titulo: item.titulo, producto, archivo: archivoDeProducto(producto) };
    });
}

function faltantesDelPedido(order) {
  return archivosDelPedido(order).filter((a) => !a.archivo.existe).map((a) => a.titulo);
}

// Correo de compra con sus botones de descarga (lo usan el aviso de Mercado
// Pago, el reintento automatico y "Reenviar correo" de Ventas).
async function mandarCorreoCompra(order) {
  const { enviarCorreoConfirmacionCompra, enviarAvisoEquipoArchivoFaltante } = require('./email');
  const contenido = store.getContent();
  const disponibles = new Map(archivosDelPedido(order).map((a) => [a.i, a.archivo.existe]));
  const itemsConArchivo = (order.items || []).map((item, i) => (item.tipo === 'producto' ? { ...item, archivoDisponible: !!disponibles.get(i) } : item));
  await enviarCorreoConfirmacionCompra({
    to: order.email,
    order: { ...order, items: itemsConArchivo },
    siteUrl: SITE_URL,
    numeroWhatsapp: contenido.whatsapp_numero,
    linkEbooks: disponibles.size ? linkEbooks(order) : '',
  });
  store.updateOrder(order.id, { correoEnviado: true, correoEnviadoAt: new Date().toISOString(), correoError: '' });
  const faltan = faltantesDelPedido(order);
  if (faltan.length && !order.avisoFaltanteEnviado && EQUIPO_NOTIFICACIONES_EMAIL.length) {
    enviarAvisoEquipoArchivoFaltante({ to: EQUIPO_NOTIFICACIONES_EMAIL, order, faltan, siteUrl: SITE_URL })
      .then(() => store.updateOrder(order.id, { avisoFaltanteEnviado: true }))
      .catch((err) => console.error(`[entregas] No se pudo avisar al equipo del archivo faltante (pedido ${order.id}):`, err.message));
  }
}

function registrarFalloCorreo(order, err) {
  store.updateOrder(order.id, {
    correoIntentos: (Number(order.correoIntentos) || 0) + 1,
    correoError: String((err && err.message) || err || '').slice(0, 300),
  });
}

// Pedidos pagados cuyo correo no salio (Resend caido, limite, etc.): se
// reintenta cada hora durante 7 dias, hasta MAX_INTENTOS_CORREO veces.
async function reintentarCorreosPendientes(ahora = new Date()) {
  const limite = ahora.getTime() - 7 * 24 * 60 * 60 * 1000;
  const pendientes = store.getOrders().filter((o) =>
    o.estado === 'aprobado'
    && !o.correoEnviado
    && o.email
    && new Date(o.createdAt).getTime() >= limite
    && (Number(o.correoIntentos) || 0) < MAX_INTENTOS_CORREO
    && (o.items || []).length
    && (o.items || []).every((i) => i.tipo === 'producto'));
  let enviados = 0;
  for (const order of pendientes) {
    try {
      await mandarCorreoCompra(order);
      enviados += 1;
    } catch (err) {
      registrarFalloCorreo(order, err);
    }
  }
  return { revisados: pendientes.length, enviados };
}

// "Mandarmelo por correo": el PDF como adjunto, para las apps que no dejan
// descargar. Con limite por eBook y dia para que no se abuse del boton.
async function mandarAdjunto(order, itemIndex, ahora = new Date()) {
  const { enviarCorreoAdjuntoEbook } = require('./email');
  const item = (order.items || [])[itemIndex];
  if (!item || item.tipo !== 'producto') return { error: 'Ese eBook no está en tu pedido.', status: 404 };
  const producto = store.getProduct(item.itemId);
  const archivo = archivoDeProducto(producto);
  if (!archivo.existe) return { error: 'Este archivo todavía no está listo. Escríbenos por WhatsApp y te lo mandamos.', status: 404 };
  if (archivo.bytes > MAX_ADJUNTO_BYTES) return { error: 'Este PDF pesa demasiado para mandarlo por correo. Usa "Descargar PDF" o escríbenos por WhatsApp.', status: 413 };
  const hoy = ahora.toISOString().slice(0, 10);
  const registro = (order.adjuntosEnviados && order.adjuntosEnviados[hoy]) || {};
  if ((registro[itemIndex] || 0) >= MAX_ADJUNTOS_POR_LIBRO_DIA) {
    return { error: 'Ya te lo mandamos varias veces hoy. Revisa tu carpeta de spam o promociones, o escríbenos por WhatsApp.', status: 429 };
  }
  await enviarCorreoAdjuntoEbook({
    to: order.email,
    titulo: item.titulo,
    nombreArchivo: nombreDescarga(producto, archivo),
    contenido: fs.readFileSync(archivo.ruta),
    linkEbooks: linkEbooks(order),
  });
  store.updateOrder(order.id, { adjuntosEnviados: { [hoy]: { ...registro, [itemIndex]: (registro[itemIndex] || 0) + 1 } } });
  return { ok: true, email: order.email };
}

// Revision de todos los productos que se venden como archivo.
function revisarArchivos() {
  const vendidos = new Map();
  store.getOrders().filter((o) => o.estado === 'aprobado').forEach((o) => (o.items || []).forEach((i) => {
    if (i.tipo === 'producto') vendidos.set(Number(i.itemId), (vendidos.get(Number(i.itemId)) || 0) + 1);
  }));
  const digitales = store.getProducts().filter((p) => ['ebook', 'recetario', 'anexo'].includes(p.categoria) || p.archivo);
  return digitales.map((p) => {
    const a = archivoDeProducto(p);
    let problema = '';
    if (!p.archivo) problema = 'sin_archivo';
    else if (!a.existe) problema = 'falta_en_servidor';
    else if (a.extension === '.pdf' && !a.esPdf) problema = 'pdf_danado';
    else if (a.bytes > PESO_ALTO_BYTES) problema = 'muy_pesado';
    return {
      id: p.id,
      titulo: p.titulo,
      categoria: p.categoria,
      esPaquete: !!p.esPaquete,
      oculto: !!p.ocultoEnCatalogo,
      bytes: a.bytes,
      problema,
      ventas: vendidos.get(p.id) || 0,
    };
  });
}

function iniciarEntregasAutomaticas() {
  const correr = () => reintentarCorreosPendientes().catch((err) => console.error('[entregas] Falló el reintento de correos:', err.message));
  setTimeout(correr, 6 * 60 * 1000);
  setInterval(correr, 60 * 60 * 1000);
}

module.exports = {
  esDigital,
  sePuedeEntregar,
  archivoDeProducto,
  archivosDelPedido,
  faltantesDelPedido,
  linkEbooks,
  nombreDescarga,
  mandarCorreoCompra,
  registrarFalloCorreo,
  reintentarCorreosPendientes,
  mandarAdjunto,
  revisarArchivos,
  iniciarEntregasAutomaticas,
  MAX_ADJUNTO_BYTES,
};
