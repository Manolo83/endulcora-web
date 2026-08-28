// Genera la plantilla del reconocimiento: la hoja base sobre la que la app
// escribe el nombre, el taller, el folio y el mes de cada persona.
//
// Trae ya el logotipo actual y deja vacio el espacio de la firma, que se pone
// aparte subiendo marca/firma-chef.png desde la app.
const { createCanvas } = require('@napi-rs/canvas');
const fs = require('fs');

// Con --limpia se omiten los textos de muestra ("NOMBRE DEL TALLER", etc.) y
// sale la hoja con las zonas variables vacias, lista para que otro programa
// escriba encima. Sin la bandera salen los textos, util para revisar el diseño.
const LIMPIA = process.argv.includes('--limpia');

const W = 2246, H = 1588;
const MORADO = '#5B1F5E', ORO = '#F5B324', ROSA = '#D89BE0', CAFE = '#9A7229';
const c = createCanvas(W, H), x = c.getContext('2d');

x.fillStyle = '#fff'; x.fillRect(0, 0, W, H);

// Adornos de las esquinas: cuartos de circulo y cuadros alternados.
function adorno(cx, cy, lado, giro) {
  const cols = [MORADO, ORO, ROSA, CAFE, ORO, MORADO];
  cols.forEach((col, i) => {
    const fila = Math.floor(i / 2), col2 = i % 2;
    x.save();
    x.translate(cx + giro * col2 * lado, cy + fila * lado);
    x.fillStyle = col;
    if (i % 3 === 0) { x.beginPath(); x.arc(0, 0, lado * 0.5, 0, 7); x.fill(); }
    else x.fillRect(-lado * 0.5, -lado * 0.5, lado, lado);
    x.restore();
  });
}
adorno(0.045 * W, 0.06 * H, 0.055 * W, 1);
adorno(0.90 * W, 0.80 * H, 0.055 * W, 1);

x.textAlign = 'center'; x.fillStyle = '#2B2B2B';
x.font = `bold ${0.088 * H}px "Liberation Sans"`;
x.fillText('RECONOCIMIENTO', W / 2, 0.216 * H);

// --- zonas variables ---
if (!LIMPIA) {
  x.font = `bold ${0.032 * H}px "Liberation Sans"`;
  x.fillText('NOMBRE TALLER', W / 2, 0.325 * H);
}

x.font = `${0.020 * H}px "Liberation Sans"`;
x.fillText('O T O R G A D O   A :', W / 2, 0.391 * H);

if (!LIMPIA) {
  x.font = `bold ${0.046 * H}px "Liberation Sans"`;
  x.fillText('NOMBRE ALUMNO', W / 2, 0.502 * H);
}

// Linea dorada bajo el nombre: es fija y NO debe borrarse.
x.strokeStyle = ORO; x.lineWidth = 4;
x.beginPath(); x.moveTo(0.213 * W, 0.536 * H); x.lineTo(0.827 * W, 0.536 * H); x.stroke();

if (!LIMPIA) {
  x.fillStyle = '#2B2B2B'; x.font = `${0.0175 * H}px "Liberation Sans"`;
  x.fillText('Por haber completado satisfactoriamente un programa de 4 horas de práctica en', W / 2, 0.578 * H);
  x.fillText('el curso de Galletas NY Gourmet del mes de Abril de 2026', W / 2, 0.612 * H);
}

// --- logotipo VIEJO: banderin morado pegado al borde izquierdo ---
x.fillStyle = MORADO;
x.beginPath();
x.moveTo(0, 0.629 * H); x.lineTo(0.222 * W, 0.629 * H);
x.lineTo(0.196 * W, 0.710 * H); x.lineTo(0.222 * W, 0.792 * H);
x.lineTo(0, 0.792 * H); x.closePath(); x.fill();
x.fillStyle = '#fff'; x.textAlign = 'center';
x.font = `bold ${0.040 * H}px "Liberation Sans"`;
x.fillText('ENDUL', 0.105 * W, 0.678 * H);
x.fillText('CORA', 0.105 * W, 0.722 * H);
x.font = `${0.014 * H}px "Liberation Sans"`;
x.fillText('ESTUDIO GASTRONÓMICO', 0.105 * W, 0.760 * H);

// --- ovalo beige del folio ---
x.fillStyle = '#EFE4CC';
x.beginPath(); x.ellipse(0.113 * W, 0.864 * H, 0.101 * W, 0.048 * H, 0, 0, 7); x.fill();
x.fillStyle = '#2B2B2B';
if (!LIMPIA) {
  x.font = `${0.0145 * H}px "Liberation Sans"`;
  x.fillText('Folio 2961', 0.113 * W, 0.838 * H);
}
x.font = `${0.0135 * H}px "Liberation Sans"`;
x.fillText('PERMISO ST Y PS – CNI – 4509280013', 0.113 * W, 0.879 * H);

// --- firma y cargo (fijos) ---
// El espacio de la firma se deja EN BLANCO a proposito. Antes iba aqui un
// garabato de relleno, pero esta hoja es la plantilla de la que salen los
// reconocimientos de verdad: una firma inventada impresa junto a un numero de
// permiso es peor que un espacio vacio. La firma real se pone desde la app,
// subiendo marca/firma-chef.png.
x.strokeStyle = '#2B2B2B'; x.lineWidth = 3;
x.beginPath(); x.moveTo(0.390 * W, 0.798 * H); x.lineTo(0.660 * W, 0.798 * H); x.stroke();
x.font = `bold ${0.024 * H}px "Liberation Sans"`;
x.fillText('CHEF LUIS ALFONSO JIMENEZ CARDENAS', 0.525 * W, 0.837 * H);
x.font = `italic ${0.020 * H}px "Liberation Sans"`;
x.fillText('Director General de Endulcora', 0.525 * W, 0.882 * H);

fs.writeFileSync(process.argv[2], c.toBuffer('image/png'));
console.log('plantilla de ejemplo creada:', process.argv[2]);
