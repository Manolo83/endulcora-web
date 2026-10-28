// Imagen para WhatsApp/Facebook (og:image) de la promocion del momento, con
// el mismo diseño de la de Buen Fin pero con el titulo y precios que esten
// configurados en /admin. Se genera sola la primera vez que se pide y se
// guarda en memoria hasta que cambia algun dato.
const path = require('path');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');

const FUENTES = path.join(__dirname, '..', 'assets', 'fuentes');
let fuentesListas = false;
function registrarFuentes() {
  if (fuentesListas) return;
  GlobalFonts.registerFromPath(path.join(FUENTES, 'Baloo2-ExtraBold.ttf'), 'Baloo2');
  GlobalFonts.registerFromPath(path.join(FUENTES, 'BebasNeue-Regular.ttf'), 'Bebas');
  GlobalFonts.registerFromPath(path.join(FUENTES, 'Montserrat-Bold.ttf'), 'MontserratB');
  fuentesListas = true;
}

const C = { vino: '#4E1454', crema: '#FBF4E9', flama: '#F5A623', rojo: '#C8312B', carbon: '#1B0720' };

function textoEspaciado(ctx, texto, x, y, espacio) {
  let cx = x;
  for (const letra of texto) {
    ctx.fillText(letra, cx, y);
    cx += ctx.measureText(letra).width + espacio;
  }
}

function cajaRedonda(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Parte el titulo en renglones que quepan en el ancho; si no caben en 2-3
// renglones, baja el tamaño de letra.
function acomodarTitulo(ctx, titulo, ancho) {
  for (let tam = 104; tam >= 52; tam -= 4) {
    ctx.font = `${tam}px Baloo2`;
    const palabras = titulo.split(/\s+/).filter(Boolean);
    const renglones = [];
    let actual = '';
    for (const p of palabras) {
      const prueba = actual ? `${actual} ${p}` : p;
      if (ctx.measureText(prueba).width <= ancho || !actual) actual = prueba;
      else { renglones.push(actual); actual = p; }
    }
    if (actual) renglones.push(actual);
    const maxRenglones = tam > 76 ? 2 : 3;
    if (renglones.length <= maxRenglones && renglones.every((r) => ctx.measureText(r).width <= ancho)) return { tam, renglones };
  }
  ctx.font = '56px Baloo2';
  return { tam: 56, renglones: [titulo] };
}

function pesos(n) {
  return `$${Number(n || 0).toLocaleString('es-MX', { maximumFractionDigits: 2 })}`;
}

function generarImagenPromo({ titulo, precioUno, precioPaquete, precioNormal }) {
  registrarFuentes();
  const W = 1200;
  const H = 630;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = C.vino;
  ctx.fillRect(0, 0, W, H);

  // Cinta "SOLO COMUNIDAD" en la esquina
  ctx.save();
  ctx.translate(W - 185, 128);
  ctx.rotate(Math.PI / 4.4);
  ctx.fillStyle = C.rojo;
  ctx.fillRect(-260, -38, 520, 76);
  ctx.fillStyle = C.crema;
  ctx.font = '28px MontserratB';
  ctx.textBaseline = 'middle';
  const cinta = 'SOLO COMUNIDAD';
  let anchoCinta = 0;
  for (const l of cinta) anchoCinta += ctx.measureText(l).width + 5;
  textoEspaciado(ctx, cinta, -anchoCinta / 2, 2, 5);
  ctx.restore();

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = C.flama;
  ctx.font = '22px MontserratB';
  textoEspaciado(ctx, 'ENDULCORA · eBOOKS', 72, 78, 6);

  const { tam, renglones } = acomodarTitulo(ctx, titulo, 700);
  ctx.fillStyle = C.crema;
  ctx.font = `${tam}px Baloo2`;
  const alto = tam * 0.98;
  renglones.forEach((r, i) => ctx.fillText(r, 70, 120 + tam * 0.8 + i * alto));

  // Precios
  const yCaja = 384;
  cajaRedonda(ctx, 72, yCaja, 228, 182, 22);
  ctx.fillStyle = 'rgba(251,244,233,0.12)';
  ctx.fill();
  cajaRedonda(ctx, 327, yCaja, 228, 182, 22);
  ctx.fillStyle = C.flama;
  ctx.fill();
  const precio = (x, etiqueta, valor, nota, colorEtiqueta, colorValor, colorNota) => {
    ctx.fillStyle = colorEtiqueta;
    ctx.font = '20px MontserratB';
    textoEspaciado(ctx, etiqueta, x + 28, yCaja + 36, 3);
    ctx.fillStyle = colorValor;
    ctx.font = `${String(valor).length > 5 ? 74 : 92}px Bebas`;
    ctx.fillText(valor, x + 26, yCaja + 122);
    ctx.fillStyle = colorNota;
    ctx.font = '20px MontserratB';
    ctx.fillText(nota, x + 28, yCaja + 160);
  };
  precio(72, '1 EBOOK', pesos(precioUno), `antes ${pesos(precioNormal)}`, 'rgba(251,244,233,0.75)', C.crema, C.crema);
  precio(327, '4 EBOOKS', pesos(precioPaquete), `${pesos(precioPaquete / 4)} cada uno`, C.carbon, C.rojo, C.carbon);

  // Circulo del descuento
  const descuento = Math.round((1 - precioPaquete / (precioNormal * 4)) * 100);
  if (descuento > 0) {
    ctx.beginPath();
    ctx.arc(1005, 438, 125, 0, Math.PI * 2);
    ctx.fillStyle = C.crema;
    ctx.fill();
    ctx.save();
    ctx.translate(1005, 438);
    ctx.rotate(-0.17);
    ctx.fillStyle = C.rojo;
    ctx.textAlign = 'center';
    ctx.font = '26px Bebas';
    ctx.fillText('HASTA', 0, -50);
    ctx.font = '104px Bebas';
    ctx.fillText(`-${descuento}%`, 0, 34);
    ctx.font = '24px Bebas';
    ctx.fillText('DE DESCUENTO', 0, 66);
    ctx.restore();
  }
  return canvas.toBuffer('image/png');
}

const cache = { clave: '', png: null };
function imagenPromo(datos) {
  const clave = JSON.stringify(datos);
  if (cache.clave !== clave) {
    cache.png = generarImagenPromo(datos);
    cache.clave = clave;
  }
  return cache.png;
}

module.exports = { imagenPromo, generarImagenPromo };
