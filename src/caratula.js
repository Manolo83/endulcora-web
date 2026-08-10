const fs = require('fs');
const path = require('path');

// Genera una imagen de portada a partir de la primera pagina de un PDF, para
// usarla como imagen de un producto (eBook/anexo) cuando el administrador no
// sube una imagen propia. Si algo falla (PDF dañado, protegido, etc.) regresa
// null y el producto se queda sin imagen (fondo por defecto), sin tronar la subida.
const CARATULA_LADO_MAXIMO = 1000;

async function generarCaratulaPDF(rutaPDF) {
  try {
    const { createCanvas } = require('@napi-rs/canvas');
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const pdfjsRoot = path.dirname(require.resolve('pdfjs-dist/package.json'));
    const standardFontDataUrl = path.join(pdfjsRoot, 'standard_fonts') + path.sep;

    const data = new Uint8Array(fs.readFileSync(rutaPDF));
    const doc = await pdfjsLib.getDocument({ data, disableFontFace: true, standardFontDataUrl }).promise;
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const escala = Math.min(CARATULA_LADO_MAXIMO / base.width, CARATULA_LADO_MAXIMO / base.height, 3);
    const viewport = page.getViewport({ scale: Math.max(escala, 0.1) });

    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    return canvas.toBuffer('image/png');
  } catch (e) {
    console.error('No se pudo generar la carátula del PDF, se deja sin imagen:', e.message);
    return null;
  }
}

module.exports = { generarCaratulaPDF };
