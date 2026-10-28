// Pagina "Tus eBooks" que abren los botones "Descargar" del correo de
// compra. Antes el boton bajaba el PDF directo, pero las apps de correo
// (Outlook, Hotmail, Yahoo) y las de redes abren el link en su navegador
// interno, que no sabe descargar archivos: la clienta solo veia una pagina
// en blanco. Una pagina normal si se ve en cualquier app, y desde ahi se
// descarga cada PDF o se abre en Chrome/Safari si la app no lo permite.
const path = require('path');
const fs = require('fs');
const { UPLOAD_DIR } = require('./config');
const store = require('./store');

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function tamano(bytes) {
  if (!bytes) return '';
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(mb >= 10 ? 0 : 1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function paginaDescargas(order, { itemElegido } = {}) {
  const contenido = store.getContent();
  const whatsapp = String(contenido.whatsapp_numero || '5665271901').replace(/\D/g, '');
  const base = `/api/pedidos/${order.id}/descarga`;
  const libros = (order.items || [])
    .map((item, i) => ({ item, i }))
    .filter(({ item }) => item.tipo === 'producto')
    .map(({ item, i }) => {
      const producto = store.getProduct(item.itemId);
      let bytes = 0;
      if (producto && producto.archivo) {
        try { bytes = fs.statSync(path.join(UPLOAD_DIR, path.basename(producto.archivo))).size; } catch (e) { bytes = 0; }
      }
      return { i, titulo: item.titulo, disponible: !!bytes, peso: tamano(bytes), url: `${base}/${i}?token=${encodeURIComponent(order.descargaToken)}&archivo=1` };
    });

  const filas = libros.map((l) => `
      <li class="libro${l.i === itemElegido ? ' elegido' : ''}" id="libro-${l.i}">
        <div class="info"><b>${esc(l.titulo)}</b><span>${l.disponible ? `PDF · ${l.peso}` : 'Archivo en preparación'}</span></div>
        ${l.disponible
          ? `<a class="boton" href="${esc(l.url)}" data-url="${esc(l.url)}">Descargar PDF</a>`
          : `<a class="boton gris" href="https://wa.me/52${whatsapp}?text=${encodeURIComponent(`Hola, no puedo descargar "${l.titulo}" de mi pedido ${order.id}.`)}">Pedirlo por WhatsApp</a>`}
      </li>`).join('');

  return `<!doctype html>
<html lang="es"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Tus eBooks · Endulcora</title>
<style>
  :root{--crema:#FBF4E9;--vino:#4E1454;--flama:#F5A623;--carbon:#1B0720;--suave:#6b5a6e;--linea:rgba(78,20,84,.14)}
  *{box-sizing:border-box}
  body{margin:0;background:var(--crema);color:var(--carbon);font-family:Arial,Helvetica,sans-serif;line-height:1.5}
  main{max-width:560px;margin:0 auto;padding:24px 16px 48px}
  .marca{font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:#7A2E7E;font-weight:700}
  h1{color:var(--vino);font-size:26px;line-height:1.15;margin:6px 0 4px}
  p{margin:0}
  .sub{color:var(--suave);font-size:14px}
  .aviso{display:none;background:#fff3dc;border:1px solid #f5c26b;border-radius:14px;padding:14px;margin-top:16px;font-size:14px}
  .aviso b{display:block;color:#7a4b00;margin-bottom:4px}
  .aviso .acciones{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
  .aviso.visible{display:block}
  ul{list-style:none;margin:18px 0 0;padding:0;display:grid;gap:10px}
  .libro{background:#fff;border:1px solid var(--linea);border-radius:14px;padding:12px 14px;display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between}
  .libro.elegido{border:2px solid var(--flama)}
  .info{min-width:0;flex:1 1 180px}
  .info b{display:block;color:var(--vino);font-size:15px}
  .info span{font-size:12.5px;color:var(--suave)}
  .boton{display:inline-block;background:var(--flama);color:var(--carbon);font-weight:700;font-size:13px;letter-spacing:.04em;text-transform:uppercase;text-decoration:none;border-radius:999px;padding:11px 18px;border:0;cursor:pointer;font-family:inherit}
  .boton.gris{background:#efe7f0;color:var(--vino)}
  .boton.vino{background:var(--vino);color:#fff}
  .boton:focus-visible{outline:3px solid var(--vino);outline-offset:2px}
  .ayuda{margin-top:22px;font-size:13.5px;color:var(--suave)}
  .ayuda a{color:var(--vino)}
</style></head>
<body><main>
  <span class="marca">Endulcora</span>
  <h1>Tus eBooks</h1>
  <p class="sub">Pedido ${order.id} · ${libros.length} eBook${libros.length === 1 ? '' : 's'}. Son tuyos para siempre: puedes volver a esta página cuando quieras desde el correo de tu compra.</p>

  <div class="aviso" id="avisoApp">
    <b>Tu app de correo no deja descargar archivos</b>
    Abriste este enlace dentro de la app de correo y esa app no guarda PDFs. Ábrelo en tu navegador y ahí se descargan normal.
    <div class="acciones">
      <a class="boton vino" id="abrirNavegador" href="#">Abrir en Chrome</a>
      <button class="boton gris" type="button" id="copiarLink">Copiar enlace</button>
    </div>
  </div>

  <ul>${filas}</ul>

  <p class="ayuda">¿No se descarga alguno? Escríbenos por WhatsApp al <a href="https://wa.me/52${whatsapp}?text=${encodeURIComponent(`Hola, no puedo descargar mis eBooks del pedido ${order.id}.`)}">${whatsapp.replace(/(\d{2})(\d{4})(\d{4})/, '$1 $2 $3')}</a> y te los mandamos directo.</p>
</main>
<script>
(function(){
  var ua = navigator.userAgent || '';
  var android = /Android/i.test(ua);
  // Navegadores internos de apps (Outlook, Hotmail, Facebook, Instagram...)
  var enApp = /; wv\\)|FBAN|FBAV|Instagram|Outlook|Line\\/|MicroMessenger|GSA\\//i.test(ua);
  var pagina = location.href;
  if (enApp) {
    document.getElementById('avisoApp').classList.add('visible');
    var abrir = document.getElementById('abrirNavegador');
    if (android) {
      abrir.href = 'intent://' + location.host + location.pathname + location.search + '#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=' + encodeURIComponent(pagina) + ';end';
    } else {
      abrir.textContent = 'Abrir en Safari';
      abrir.href = pagina.replace(/^https:/, 'x-safari-https:');
    }
  }
  document.getElementById('copiarLink').addEventListener('click', function(){
    var b = this;
    var listo = function(){ b.textContent = 'Enlace copiado: pégalo en Chrome o Safari'; };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(pagina).then(listo, function(){ prompt('Copia este enlace:', pagina); });
    else prompt('Copia este enlace:', pagina);
  });
  var elegido = document.querySelector('.libro.elegido');
  if (elegido) elegido.scrollIntoView({ block: 'center' });
})();
</script>
</body></html>`;
}

module.exports = { paginaDescargas };
