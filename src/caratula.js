const fs = require('fs');
const path = require('path');

// Genera una imagen de portada a partir de la primera pagina de un PDF, para
// usarla como imagen de un producto (eBook/anexo) cuando el administrador no
// sube una imagen propia. Si algo falla (PDF dañado, protegido, etc.) regresa
// null y el producto se queda sin imagen (fondo por defecto), sin tronar la subida.
const CARATULA_LADO_MAXIMO = 1000;

// La biblioteca de lectura para miembros (src/routes/membresia.js) reusa
// este mismo motor de render: convierte cada pagina del PDF en una imagen
// del lado del servidor para poder mostrarla sin exponer nunca el archivo
// original (a diferencia de abrir el PDF real, que se puede guardar desde
// el propio visor del navegador).
const LECTURA_ANCHO_MAXIMO = 1400;

async function abrirDocumentoPDF(rutaPDF) {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdfjsRoot = path.dirname(require.resolve('pdfjs-dist/package.json'));
  const standardFontDataUrl = path.join(pdfjsRoot, 'standard_fonts') + path.sep;
  const data = new Uint8Array(fs.readFileSync(rutaPDF));
  return pdfjsLib.getDocument({ data, disableFontFace: true, standardFontDataUrl }).promise;
}

async function renderizarPagina(page, ladoMaximo) {
  const { createCanvas } = require('@napi-rs/canvas');
  const base = page.getViewport({ scale: 1 });
  const escala = Math.min(ladoMaximo / base.width, ladoMaximo / base.height, 3);
  const viewport = page.getViewport({ scale: Math.max(escala, 0.1) });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas.toBuffer('image/png');
}

async function generarCaratulaPDF(rutaPDF) {
  try {
    const doc = await abrirDocumentoPDF(rutaPDF);
    const page = await doc.getPage(1);
    return await renderizarPagina(page, CARATULA_LADO_MAXIMO);
  } catch (e) {
    console.error('No se pudo generar la carátula del PDF, se deja sin imagen:', e.message);
    return null;
  }
}

// Cuantas paginas tiene el PDF, sin renderizar ninguna (rapido: solo lee el
// indice del documento).
async function contarPaginasPDF(rutaPDF) {
  const doc = await abrirDocumentoPDF(rutaPDF);
  return doc.numPages;
}

// Una pagina especifica, como imagen PNG, para el lector de la biblioteca de
// miembros. numeroPagina es 1-based, igual que en cualquier lector de PDF.
async function generarPaginaLecturaPDF(rutaPDF, numeroPagina) {
  const doc = await abrirDocumentoPDF(rutaPDF);
  if (numeroPagina < 1 || numeroPagina > doc.numPages) return null;
  const page = await doc.getPage(numeroPagina);
  return renderizarPagina(page, LECTURA_ANCHO_MAXIMO);
}

module.exports = { generarCaratulaPDF, contarPaginasPDF, generarPaginaLecturaPDF };
