// Arma la version apilada del logotipo (ENDUL arriba, CORA abajo, ESTUDIO
// GASTRONOMICO al pie) recortando y reacomodando el logotipo horizontal
// original. No se redibuja nada: son los mismos trazos, solo reacomodados,
// asi que el batidor de la D y el cuchillo de la O quedan intactos.
//
// Las coordenadas salieron de medir el PNG horizontal pixel por pixel.
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const fs = require('fs');
const path = require('path');

// Recortes medidos sobre public/logo-endulcora.png (1400x331)
// El morado de la L y el dorado de la C se tocan en x=750, asi que ENDUL corta
// justo antes y CORA arranca justo despues: si no, a CORA le quedaba pegada una
// mota morada en el borde izquierdo.
const ENDUL = { x: 20, y: 14, w: 730, h: 216 };
const CORA = { x: 751, y: 14, w: 624, h: 216 };
const ESTUDIO = { x: 288, y: 261, w: 818, h: 57 };

const SEPARACION = 18;   // espacio entre ENDUL y CORA
const ANTES_ESTUDIO = 26; // espacio antes del renglon de abajo
const MARGEN = 12;


// Borra de una franja los pixeles del color indicado, dejandolos transparentes.
function limpiarOrilla(ctx, x0, y0, ancho, alto, color) {
  const ix = Math.max(0, Math.round(x0));
  const iy = Math.max(0, Math.round(y0));
  const iw = Math.max(1, Math.round(ancho));
  const ih = Math.max(1, Math.round(alto));
  const imagen = ctx.getImageData(ix, iy, iw, ih);
  const d = imagen.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 40) continue;
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const esDorado = r > 170 && g > 110 && b < 165 && r - b > 55;
    const esMorado = r < 160 && b > 55 && g < 115 && b - g > 15;
    if ((color === 'dorado' && esDorado) || (color === 'morado' && esMorado)) {
      d[i + 3] = 0;
    }
  }
  ctx.putImageData(imagen, ix, iy);
}

(async () => {
  const origen = process.argv[2] || path.join(__dirname, '..', '..', 'public', 'logo-endulcora.png');
  const destino = process.argv[3] || path.join(__dirname, '..', 'marca', 'logo-endulcora.png');

  const img = await loadImage(fs.readFileSync(origen));

  // El renglon de abajo se estira para que ocupe casi todo el ancho, como en
  // la version apilada de la marca.
  const anchoLetras = Math.max(ENDUL.w, CORA.w);
  const anchoEstudio = anchoLetras * 0.98;
  const altoEstudio = ESTUDIO.h * (anchoEstudio / ESTUDIO.w);

  const W = anchoLetras + MARGEN * 2;
  const H = MARGEN * 2 + ENDUL.h + SEPARACION + CORA.h + ANTES_ESTUDIO + altoEstudio;

  const c = createCanvas(Math.round(W), Math.round(H));
  const x = c.getContext('2d');

  // Cada pieza va centrada horizontalmente y a su tamano original: no se
  // reescalan las letras, para no alterar la proporcion de la marca.
  const centrar = (ancho) => MARGEN + (anchoLetras - ancho) / 2;

  let y = MARGEN;
  x.drawImage(img, ENDUL.x, ENDUL.y, ENDUL.w, ENDUL.h, centrar(ENDUL.w), y, ENDUL.w, ENDUL.h);
  // En la costura queda una mota del color vecino, porque la L morada y la C
  // dorada se tocan. Se limpia solo en las columnas del borde, para no perder
  // ningun trazo de la letra.
  limpiarOrilla(x, centrar(ENDUL.w) + ENDUL.w - 16, y, 16, ENDUL.h, 'dorado');
  y += ENDUL.h + SEPARACION;
  x.drawImage(img, CORA.x, CORA.y, CORA.w, CORA.h, centrar(CORA.w), y, CORA.w, CORA.h);
  limpiarOrilla(x, centrar(CORA.w), y, 16, CORA.h, 'morado');
  y += CORA.h + ANTES_ESTUDIO;
  x.drawImage(img, ESTUDIO.x, ESTUDIO.y, ESTUDIO.w, ESTUDIO.h,
    centrar(anchoEstudio), y, anchoEstudio, altoEstudio);

  fs.writeFileSync(destino, c.toBuffer('image/png'));
  console.log(`logotipo apilado: ${destino} (${c.width}x${c.height})`);
})();
