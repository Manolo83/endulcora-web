import { chromium } from 'playwright';
import fs from 'fs';
const html = fs.readFileSync('informe-talleres.html','utf8');
const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p = await b.newPage({viewport:{width:1100,height:1400}, colorScheme:'light'});
const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
await p.setContent(
 `<!doctype html><html data-theme="light"><head><meta charset="utf-8">`+
 `<meta name="viewport" content="width=device-width,initial-scale=1">`+
 `<style>body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style></head><body>${html}</body></html>`,
 {waitUntil:'networkidle'});
await p.evaluate(()=>document.fonts.ready);
await p.waitForTimeout(1500);
// la línea de referencia se posiciona midiendo: recalcular tras el layout final
await p.evaluate(()=>{ if(window.placeRef) window.placeRef(); });
await p.emulateMedia({media:'print', colorScheme:'light'});
await p.waitForTimeout(600);
await p.pdf({
  path:'Endulcora-talleres-informe.pdf',
  format:'A4', printBackground:true,
  margin:{top:'14mm',bottom:'16mm',left:'12mm',right:'12mm'},
  displayHeaderFooter:true,
  headerTemplate:'<div></div>',
  footerTemplate:'<div style="width:100%;font-family:Helvetica,Arial,sans-serif;font-size:7.5pt;color:#7A6579;padding:0 12mm;display:flex;justify-content:space-between;"><span>Endulcora · Qué taller vender cada mes · 29 de agosto de 2026</span><span class="pageNumber"></span>/<span class="totalPages"></span></div>'
});
console.log('errores JS:', errs.length?errs:'ninguno');
process.exit(0);
