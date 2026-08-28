const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const PDFDocument = require('pdfkit');

// Genera el reconocimiento de cada persona a partir de una pagina exportada del
// Canva "RECONOCIMIENTOS 7".
//
// Como funciona: se toma la pagina tal cual (con el nombre de alguien mas
// impreso), se tapan las cuatro zonas que cambian de persona a persona y se
// vuelven a escribir con los datos correctos. Asi no hace falta que exista una
// plantilla en blanco: sirve cualquier pagina del archivo de Canva.
//
// Las cuatro zonas variables, vistas en las paginas reales:
//   nombre del taller  ->  "GALLETAS NY GOURMET"
//   nombre de la persona -> "Paola Ximena Ramirez Arreola"
//   linea descriptiva  ->  "...en el curso de Galletas NY Gourmet del mes de Abril de 2026"
//   folio              ->  "Folio 2961"  (sobre el ovalo beige del logo)

// Si se ponen archivos .ttf en la carpeta "fuentes", se usan en lugar de las
// tipografias del sistema. Es la forma de que el texto quede identico al Canva.
const DIR_FUENTES = path.join(__dirname, '..', 'fuentes');
let FAMILIA_TITULO = 'Liberation Sans';
let FAMILIA_NOMBRE = 'Liberation Sans';

function cargarFuentes() {
  if (!fs.existsSync(DIR_FUENTES)) return;
  for (const archivo of fs.readdirSync(DIR_FUENTES)) {
    if (!/\.(ttf|otf)$/i.test(archivo)) continue;
    try {
      GlobalFonts.registerFromPath(path.join(DIR_FUENTES, archivo));
    } catch (e) {
      console.error('No se pudo cargar la fuente', archivo, e.message);
    }
  }
  const familias = GlobalFonts.families.map((f) => f.family);
  const preferidas = ['Montserrat', 'Poppins', 'Raleway', 'Lato', 'Open Sans'];
  const encontrada = preferidas.find((p) => familias.includes(p));
  if (encontrada) {
    FAMILIA_TITULO = encontrada;
    FAMILIA_NOMBRE = encontrada;
  }
}
cargarFuentes();

// Posiciones expresadas como fraccion del ancho y alto de la hoja, para que
// funcionen igual sin importar a que resolucion se exporte la pagina de Canva.
// Se pueden ajustar desde la pantalla de Plantilla sin tocar este archivo.
const ZONAS_POR_DEFECTO = {
  // Medidas tomadas de la plantilla limpia (la que trae "NOMBRE TALLER" y
  // "NOMBRE ALUMNO"). Cada zona se queda corta a proposito para no morder los
  // elementos fijos de alrededor:
  //   - "nombre" termina antes de la linea dorada que va debajo del nombre.
  //     Esa linea es mas oscura que el blanco, asi que si entrara en la zona el
  //     borrado se la llevaria.
  //   - "folio" termina antes del renglon del permiso, que no cambia nunca.
  taller: { x: 0.12, y: 0.298, w: 0.76, h: 0.055, tam: 0.030, peso: 'bold', mayusculas: true },
  nombre: { x: 0.12, y: 0.460, w: 0.76, h: 0.070, tam: 0.045, peso: 'bold', mayusculas: true },
  texto: { x: 0.16, y: 0.556, w: 0.68, h: 0.078, tam: 0.0165, peso: 'normal', mayusculas: false },
  folio: { x: 0.034, y: 0.825, w: 0.142, h: 0.026, tam: 0.0125, peso: 'normal', mayusculas: false },
};

// El logotipo viejo de la plantilla (el banderin morado con ENDULCORA en
// blanco) se tapa y encima se dibuja el logotipo actual. Se hace aqui y no
// editando el PNG a mano para que tambien queden corregidas las paginas
// antiguas del Canva, y para que un cambio de marca sea cambiar un archivo.
//
//   tapar  = el pedazo de hoja que ocupa el logotipo viejo
//   poner  = donde se acomoda el nuevo; se ajusta solo sin deformarse
const LOGO_POR_DEFECTO = {
  tapar: { x: 0, y: 0.610, w: 0.245, h: 0.200, fondo: '#FFFFFF' },
  poner: { x: 0.022, y: 0.640, w: 0.205, h: 0.140 },
};

const RUTA_LOGO = path.join(__dirname, '..', 'marca', 'logo-endulcora.png');

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function mesEnPalabras(fecha) {
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  if (Number.isNaN(d.getTime())) return { mes: '', anio: '' };
  return { mes: MESES[d.getMonth()], anio: String(d.getFullYear()) };
}

// Busca el color de fondo de una zona mirando sus esquinas. Se usa para el
// folio, que va sobre un ovalo beige y no sobre blanco: si lo tapara con
// blanco se veria un parche.
function colorDeFondo(ctx, x, y, w, h) {
  // Se muestrea sobre la linea media horizontal, que es donde una figura
  // redondeada (como el ovalo beige del folio) es mas ancha. Muestrear las
  // esquinas daria el blanco de afuera del ovalo y dejaria un parche.
  const muestras = [
    [x + 2, y + h / 2], [x + w * 0.08, y + h / 2],
    [x + w * 0.92, y + h / 2], [x + w - 3, y + h / 2],
    [x + w / 2, y + 2], [x + w / 2, y + h - 3],
  ];
  const conteo = new Map();
  for (const [px, py] of muestras) {
    try {
      const d = ctx.getImageData(Math.round(px), Math.round(py), 1, 1).data;
      const clave = `${d[0]},${d[1]},${d[2]}`;
      conteo.set(clave, (conteo.get(clave) || 0) + 1);
    } catch (e) { /* fuera de la imagen: se ignora */ }
  }
  let mejor = '255,255,255';
  let max = 0;
  for (const [clave, n] of conteo) {
    if (n > max) { max = n; mejor = clave; }
  }
  return `rgb(${mejor})`;
}


// Tapa el logotipo viejo y dibuja encima el actual, ajustandolo dentro de su
// espacio sin deformarlo (se respeta su proporcion y se centra).
async function ponerLogo(ctx, W, H, config) {
  const cfg = {
    tapar: { ...LOGO_POR_DEFECTO.tapar, ...((config && config.tapar) || {}) },
    poner: { ...LOGO_POR_DEFECTO.poner, ...((config && config.poner) || {}) },
  };
  if (config === false) return;
  if (!fs.existsSync(RUTA_LOGO)) {
    console.error('No encontré el logotipo en', RUTA_LOGO, '— se deja el de la plantilla.');
    return;
  }

  // Se tapa con un rectangulo liso, no borrando pixel por pixel: el logotipo
  // viejo es una figura morada grande, no texto sobre un fondo parejo.
  const t = cfg.tapar;
  ctx.fillStyle = t.fondo || '#FFFFFF';
  ctx.fillRect(t.x * W, t.y * H, t.w * W, t.h * H);

  const imagen = await loadImage(fs.readFileSync(RUTA_LOGO));
  const caja = cfg.poner;
  const cajaW = caja.w * W;
  const cajaH = caja.h * H;
  const escala = Math.min(cajaW / imagen.width, cajaH / imagen.height);
  const anchoFinal = imagen.width * escala;
  const altoFinal = imagen.height * escala;

  ctx.drawImage(
    imagen,
    caja.x * W + (cajaW - anchoFinal) / 2,
    caja.y * H + (cajaH - altoFinal) / 2,
    anchoFinal,
    altoFinal
  );
}

// Borra el texto de una zona sin destruir la figura que tiene detras.
//
// Rellenar un rectangulo del color del fondo funciona cuando la zona esta sobre
// blanco, pero el folio va sobre un ovalo beige: el rectangulo le cuadraba los
// hombros al ovalo. En vez de eso se recorre pixel por pixel y solo se sustituyen
// los que se salen del color de fondo, que son justamente las letras.
function borrarTexto(ctx, x, y, w, h) {
  const ix = Math.max(0, Math.round(x));
  const iy = Math.max(0, Math.round(y));
  const iw = Math.max(1, Math.round(w));
  const ih = Math.max(1, Math.round(h));

  const fondo = colorDeFondo(ctx, x, y, w, h);
  const [fr, fg, fb] = fondo.match(/\d+/g).map(Number);
  const lumFondo = 0.299 * fr + 0.587 * fg + 0.114 * fb;

  let imagen;
  try {
    imagen = ctx.getImageData(ix, iy, iw, ih);
  } catch (e) {
    // Si la zona cae fuera de la hoja se recurre al relleno simple.
    ctx.fillStyle = fondo;
    ctx.fillRect(x, y, w, h);
    return;
  }

  const d = imagen.data;
  // Solo se borran los pixeles MAS OSCUROS que el fondo, que son las letras.
  // Si tambien se borraran los mas claros, el blanco que rodea al ovalo del
  // folio se pintaria de beige y le saldrian hombros cuadrados a la figura.
  // El margen va bajo a proposito: las letras tienen el borde suavizado y esos
  // pixeles casi del color del fondo son los que dejaban un texto fantasma
  // debajo del nuevo. Como solo se borra lo mas oscuro que el fondo, bajar el
  // margen no danha el borde del ovalo ni ninguna figura mas clara.
  const TOLERANCIA = 6;
  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    if (lum < lumFondo - TOLERANCIA) {
      d[i] = fr;
      d[i + 1] = fg;
      d[i + 2] = fb;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(imagen, ix, iy);
}

// Ajusta el tamano de letra hasta que el texto quepa en el ancho disponible.
// Es lo que evita que un nombre largo como "Maria Fernanda Gonzalez Hernandez"
// se salga de la hoja.
function tamanoQueCabe(ctx, texto, familia, peso, tamInicial, anchoMax) {
  let tam = tamInicial;
  for (let i = 0; i < 40; i++) {
    ctx.font = `${peso} ${tam}px "${familia}"`;
    if (ctx.measureText(texto).width <= anchoMax) break;
    tam -= Math.max(1, tamInicial * 0.02);
    if (tam < tamInicial * 0.45) break;
  }
  return tam;
}

// Parte un texto largo en varias lineas que quepan en el ancho dado.
function partirEnLineas(ctx, texto, anchoMax) {
  const palabras = texto.split(/\s+/).filter(Boolean);
  const lineas = [];
  let actual = '';
  for (const palabra of palabras) {
    const prueba = actual ? `${actual} ${palabra}` : palabra;
    if (ctx.measureText(prueba).width > anchoMax && actual) {
      lineas.push(actual);
      actual = palabra;
    } else {
      actual = prueba;
    }
  }
  if (actual) lineas.push(actual);
  return lineas;
}

/**
 * Dibuja un reconocimiento y devuelve el canvas listo.
 * @param {object} opciones
 * @param {string} opciones.rutaPlantilla  PNG exportado de Canva
 * @param {string} opciones.nombre         nombre completo de la persona
 * @param {string} opciones.taller         nombre del taller
 * @param {number} opciones.folio          folio consecutivo
 * @param {string|Date} opciones.fecha     fecha del taller (para el mes y anio)
 * @param {object} [opciones.zonas]        posiciones personalizadas
 */
async function dibujar({ rutaPlantilla, nombre, taller, folio, fecha, zonas, logo }) {
  // loadImage no acepta una ruta suelta, hay que pasarle el archivo ya leido.
  const imagen = await loadImage(
    Buffer.isBuffer(rutaPlantilla) ? rutaPlantilla : fs.readFileSync(rutaPlantilla)
  );
  const W = imagen.width;
  const H = imagen.height;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(imagen, 0, 0);

  const z = { ...ZONAS_POR_DEFECTO, ...(zonas || {}) };
  await ponerLogo(ctx, W, H, logo);
  const { mes, anio } = mesEnPalabras(fecha || new Date());

  const tallerLimpio = String(taller || '').trim();
  const nombreLimpio = String(nombre || '').trim();

  const contenido = {
    taller: tallerLimpio,
    nombre: nombreLimpio,
    texto: `Por haber completado satisfactoriamente un programa de 4 horas de práctica en el curso de ${tallerLimpio} del mes de ${mes} de ${anio}`,
    folio: folio ? `Folio ${folio}` : '',
  };

  for (const clave of ['taller', 'nombre', 'texto', 'folio']) {
    const zona = z[clave];
    const valor = contenido[clave];
    if (!zona || !valor) continue;

    const x = zona.x * W;
    const y = zona.y * H;
    const w = zona.w * W;
    const h = zona.h * H;

    // Se borra el texto anterior antes de escribir el nuevo.
    borrarTexto(ctx, x, y, w, h);

    const familia = clave === 'nombre' ? FAMILIA_NOMBRE : FAMILIA_TITULO;
    const texto = zona.mayusculas ? valor.toUpperCase() : valor;
    const tamBase = zona.tam * H;

    ctx.fillStyle = zona.color || '#231F20';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (clave === 'texto') {
      // La linea descriptiva se reparte en varias lineas centradas.
      ctx.font = `${zona.peso} ${tamBase}px "${familia}"`;
      const lineas = partirEnLineas(ctx, texto, w);
      const alto = tamBase * 1.45;
      const inicio = y + h / 2 - ((lineas.length - 1) * alto) / 2;
      lineas.forEach((linea, i) => {
        ctx.fillText(linea, x + w / 2, inicio + i * alto);
      });
    } else {
      const tam = tamanoQueCabe(ctx, texto, familia, zona.peso, tamBase, w * 0.96);
      ctx.font = `${zona.peso} ${tam}px "${familia}"`;
      ctx.fillText(texto, x + w / 2, y + h / 2);
    }
  }

  return canvas;
}

async function generarPNG(opciones) {
  const canvas = await dibujar(opciones);
  return canvas.encode('png');
}

// El PDF es lo que se adjunta al correo: una sola hoja horizontal con la
// imagen del reconocimiento a pagina completa.
async function generarPDF(opciones) {
  const png = await generarPNG(opciones);
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0 });
    const partes = [];
    doc.on('data', (p) => partes.push(p));
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);
    doc.image(png, 0, 0, { width: doc.page.width, height: doc.page.height });
    doc.end();
  });
}

module.exports = { generarPNG, generarPDF, ZONAS_POR_DEFECTO, LOGO_POR_DEFECTO, mesEnPalabras };
