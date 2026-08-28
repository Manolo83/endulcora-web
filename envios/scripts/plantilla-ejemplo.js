// Genera una hoja de ejemplo con la misma geometria que el Canva real, para
// solo para verificar que el generador tapa y reescribe en el lugar correcto.
const { createCanvas } = require('@napi-rs/canvas');
const fs = require('fs');
const W = 2246, H = 1588;
const c = createCanvas(W, H), x = c.getContext('2d');
x.fillStyle = '#fff'; x.fillRect(0,0,W,H);
// esquinas decorativas
const cols = ['#6B2D6B','#F0A500','#D98BC4','#8B6A3E'];
cols.forEach((col,i)=>{ x.fillStyle=col; x.beginPath(); x.arc(90+i*70, 90, 45, 0, 7); x.fill(); });
cols.forEach((col,i)=>{ x.fillStyle=col; x.beginPath(); x.arc(W-90-i*70, H-90, 45, 0, 7); x.fill(); });
// titulo fijo
x.fillStyle='#231F20'; x.textAlign='center';
x.font='bold 118px "Liberation Sans"'; x.fillText('RECONOCIMIENTO', W/2, 0.135*H);
// zona TALLER (variable)
x.font='bold 48px "Liberation Sans"'; x.fillText('GALLETAS NY GOURMET', W/2, 0.305*H);
x.font='24px "Liberation Sans"'; x.fillText('O T O R G A D O   A :', W/2, 0.382*H);
// zona NOMBRE (variable)
x.font='82px "Liberation Sans"'; x.fillText('Paola Ximena Ramírez Arreola', W/2, 0.478*H);
x.strokeStyle='#231F20'; x.lineWidth=2; x.beginPath(); x.moveTo(0.25*W,0.518*H); x.lineTo(0.75*W,0.518*H); x.stroke();
// zona TEXTO (variable)
x.font='26px "Liberation Sans"';
x.fillText('Por haber completado satisfactoriamente un programa de 4 horas de práctica en', W/2, 0.578*H);
x.fillText('el curso de Galletas NY Gourmet del mes de Abril de 2026', W/2, 0.615*H);
// logo morado
x.fillStyle='#6B2D6B'; x.fillRect(0.02*W, 0.70*H, 0.16*W, 0.10*H);
x.fillStyle='#fff'; x.font='bold 40px "Liberation Sans"'; x.fillText('ENDULCORA', 0.10*W, 0.755*H);
// ovalo beige del FOLIO (variable, sobre color)
x.fillStyle='#E8DCC0'; x.beginPath(); x.ellipse(0.105*W, 0.872*H, 0.075*W, 0.028*H, 0,0,7); x.fill();
x.fillStyle='#231F20'; x.font='22px "Liberation Sans"'; x.fillText('Folio 2961', 0.105*W, 0.866*H);
x.font='16px "Liberation Sans"'; x.fillText('PERMISO ST Y PS - CNI - 4509280013', 0.105*W, 0.892*H);
// firma fija
x.font='italic 70px "Liberation Serif"'; x.fillText('Luis J.', W/2, 0.775*H);
x.font='bold 26px "Liberation Sans"'; x.fillText('CHEF LUIS ALFONSO JIMENEZ CARDENAS', W/2, 0.858*H);
x.font='italic 22px "Liberation Sans"'; x.fillText('Director General de Endulcora', W/2, 0.888*H);
fs.writeFileSync(process.argv[2], c.toBuffer('image/png'));
console.log('plantilla de prueba creada');
