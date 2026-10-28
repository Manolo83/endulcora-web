// Pagina "Tus eBooks" que abren los botones del correo de compra. Una
// pagina normal se ve en cualquier telefono, tablet, computadora y app de
// correo (las apps abren los links en su navegador interno, que muchas veces
// no sabe descargar archivos). Desde aqui cada PDF se consigue de tres
// formas: descargarlo, pedir que llegue como archivo adjunto al correo, o
// abrir la pagina en el navegador del telefono.
const store = require('./store');
const entregas = require('./entregas');

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function tamano(bytes) {
  if (!bytes) return '';
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(mb >= 10 ? 0 : 1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// laura.gomez@gmail.com -> la•••••••@gmail.com
function correoOculto(email) {
  const [usuario, dominio] = String(email || '').split('@');
  if (!dominio) return '';
  return `${usuario.slice(0, 2)}${'•'.repeat(Math.max(3, usuario.length - 2))}@${dominio}`;
}

function paginaDescargas(order, { itemElegido } = {}) {
  const contenido = store.getContent();
  const whatsapp = String(contenido.whatsapp_numero || '5665271901').replace(/\D/g, '');
  const token = encodeURIComponent(order.descargaToken);
  const libros = entregas.archivosDelPedido(order).map(({ i, titulo, archivo }) => ({
    i,
    titulo,
    disponible: archivo.existe,
    peso: tamano(archivo.bytes),
    adjuntable: archivo.existe && archivo.bytes <= entregas.MAX_ADJUNTO_BYTES,
    tipo: ({ '.pdf': 'PDF', '.zip': 'ZIP', '.xlsx': 'Excel', '.xls': 'Excel', '.html': 'App', '.htm': 'App' })[archivo.extension] || 'Archivo',
    url: `/api/pedidos/${order.id}/descarga/${i}?token=${token}&archivo=1`,
  }));
  const linkWhats = (texto) => `https://wa.me/52${whatsapp}?text=${encodeURIComponent(texto)}`;

  const filas = libros.map((l) => `
      <li class="libro${l.i === itemElegido ? ' elegido' : ''}" id="libro-${l.i}">
        <div class="info"><b>${esc(l.titulo)}</b><span>${l.disponible ? `${l.tipo} · ${l.peso}` : 'Estamos preparando este archivo'}</span></div>
        <div class="acciones">
          ${l.disponible
            ? `<a class="boton descargar" href="${esc(l.url)}">Descargar${l.tipo === 'PDF' ? ' PDF' : ''}</a>
               ${l.adjuntable ? `<button class="boton suave adjunto" type="button" data-i="${l.i}">Mandármelo por correo</button>` : ''}`
            : `<a class="boton suave" href="${esc(linkWhats(`Hola, no puedo descargar "${l.titulo}" de mi pedido ${order.id}.`))}">Pedirlo por WhatsApp</a>`}
        </div>
        <p class="estado" role="status" aria-live="polite"></p>
      </li>`).join('');

  return `<!doctype html>
<html lang="es"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Tus eBooks · Endulcora</title>
<style>
  :root{--crema:#FBF4E9;--vino:#4E1454;--flama:#F5A623;--carbon:#1B0720;--suave:#6b5a6e;--linea:rgba(78,20,84,.14)}
  *{box-sizing:border-box}
  body{margin:0;background:var(--crema);color:var(--carbon);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;line-height:1.5;-webkit-text-size-adjust:100%}
  main{max-width:600px;margin:0 auto;padding:24px 16px 48px}
  .marca{font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:#7A2E7E;font-weight:700}
  h1{color:var(--vino);font-size:26px;line-height:1.15;margin:6px 0 4px}
  h2{color:var(--vino);font-size:16px;margin:0 0 6px}
  p{margin:0}
  .sub{color:var(--suave);font-size:14px}
  .aviso{display:none;background:#fff3dc;border:1px solid #f5c26b;border-radius:14px;padding:14px;margin-top:16px;font-size:14px}
  .aviso.visible{display:block}
  .aviso b{display:block;color:#7a4b00;margin-bottom:4px}
  .fila{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
  ul{list-style:none;margin:18px 0 0;padding:0;display:grid;gap:10px}
  .libro{background:#fff;border:1px solid var(--linea);border-radius:14px;padding:14px;display:grid;gap:10px}
  .libro.elegido{border:2px solid var(--flama)}
  .info b{display:block;color:var(--vino);font-size:15.5px}
  .info span{font-size:12.5px;color:var(--suave)}
  .acciones{display:flex;flex-wrap:wrap;gap:8px}
  .boton{display:inline-block;background:var(--flama);color:var(--carbon);font-weight:700;font-size:13px;letter-spacing:.03em;text-transform:uppercase;text-decoration:none;border-radius:999px;padding:12px 18px;border:0;cursor:pointer;font-family:inherit;text-align:center}
  .boton.suave{background:#efe7f0;color:var(--vino)}
  .boton.vino{background:var(--vino);color:#fff}
  .boton[disabled]{opacity:.55;cursor:default}
  .boton:focus-visible{outline:3px solid var(--vino);outline-offset:2px}
  .estado{font-size:13px;color:#1f7a4d}
  .estado:empty{display:none}
  .estado.error{color:#b3261e}
  .guia{margin-top:20px;background:#fff;border:1px solid var(--linea);border-radius:14px;padding:14px;font-size:14px}
  .guia ol{margin:6px 0 0;padding-left:20px}
  .guia li{margin:3px 0}
  .ayuda{margin-top:18px;font-size:13.5px;color:var(--suave)}
  .ayuda a{color:var(--vino)}
</style></head>
<body><main>
  <span class="marca">Endulcora</span>
  <h1>Tus eBooks</h1>
  <p class="sub">Pedido ${order.id} · ${libros.length} archivo${libros.length === 1 ? '' : 's'}. Son tuyos para siempre: vuelve a esta página cuando quieras desde el correo de tu compra.</p>

  <div class="aviso" id="avisoApp">
    <b>Tu app no deja descargar archivos</b>
    Abriste este enlace dentro de una app (correo, WhatsApp, Facebook…). Si al tocar "Descargar PDF" no pasa nada o se queda en blanco, usa una de estas opciones:
    <div class="fila">
      <a class="boton vino" id="abrirNavegador" href="#">Abrir en el navegador</a>
      <button class="boton suave" type="button" id="copiarLink">Copiar enlace</button>
    </div>
    <p style="margin-top:8px;font-size:13px">O toca "Mandármelo por correo" en cada eBook y te llega como archivo adjunto.</p>
  </div>

  <ul>${filas}</ul>

  <div class="guia" id="guia">
    <h2>¿Dónde queda mi PDF?</h2>
    <div data-sistema="ios" hidden><ol>
      <li>Toca "Descargar PDF": se abre el eBook.</li>
      <li>Toca el botón Compartir (el cuadrito con la flecha hacia arriba).</li>
      <li>Elige "Guardar en Archivos" o "Libros". Ahí lo tienes siempre, aun sin internet.</li>
    </ol></div>
    <div data-sistema="android" hidden><ol>
      <li>Toca "Descargar PDF" y espera a que termine (sale un aviso arriba).</li>
      <li>Lo encuentras en la app "Archivos" o "Mis archivos", carpeta "Descargas".</li>
      <li>Ábrelo con Google Drive, Adobe Acrobat o el lector de PDF de tu teléfono.</li>
    </ol></div>
    <div data-sistema="pc" hidden><ol>
      <li>Haz clic en "Descargar PDF".</li>
      <li>Se guarda en tu carpeta "Descargas". Ábrelo con tu navegador o con Adobe Acrobat.</li>
    </ol></div>
  </div>

  <p class="ayuda">¿Algo no funciona? Escríbenos por WhatsApp al <a href="${esc(linkWhats(`Hola, no puedo descargar mis eBooks del pedido ${order.id}.`))}">${whatsapp.replace(/(\d{2})(\d{4})(\d{4})/, '$1 $2 $3')}</a> y te los mandamos directo.</p>
</main>
<script>
(function(){
  var ua = navigator.userAgent || '';
  var android = /Android/i.test(ua);
  // iPadOS se presenta como Mac: se distingue porque tiene pantalla tactil.
  var ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  // Navegadores internos de apps: correo (Outlook, Yahoo, Gmail en Android),
  // WhatsApp, Facebook, Instagram, TikTok, Line, WeChat, Google.
  var enApp = /; wv\\)|FBAN|FBAV|FB_IAB|Instagram|Outlook|YahooMail|WhatsApp|TikTok|musical_ly|Line\\/|MicroMessenger|GSA\\/|GmailApp/i.test(ua)
    || (ios && !/Safari\\//.test(ua));
  var pagina = location.href;

  document.querySelectorAll('[data-sistema="' + (ios ? 'ios' : android ? 'android' : 'pc') + '"]').forEach(function(el){ el.hidden = false; });

  // En iPhone/iPad el PDF se abre en el visor (de ahi se guarda con
  // Compartir); en Android y computadora se descarga directo.
  if (ios) document.querySelectorAll('a.descargar').forEach(function(a){ a.href += '&ver=1'; });

  if (enApp) {
    document.getElementById('avisoApp').classList.add('visible');
    var abrir = document.getElementById('abrirNavegador');
    if (android) {
      abrir.textContent = 'Abrir en Chrome';
      abrir.href = 'intent://' + location.host + location.pathname + location.search + '#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=' + encodeURIComponent(pagina) + ';end';
    } else if (ios) {
      abrir.textContent = 'Abrir en Safari';
      abrir.href = pagina.replace(/^https:/, 'x-safari-https:');
    } else {
      abrir.href = pagina;
      abrir.target = '_blank';
    }
  }

  document.getElementById('copiarLink').addEventListener('click', function(){
    var b = this;
    var listo = function(){ b.textContent = 'Copiado: pégalo en tu navegador'; };
    var manual = function(){ window.prompt('Copia este enlace y pégalo en tu navegador:', pagina); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(pagina).then(listo, manual); else manual();
  });

  document.querySelectorAll('button.adjunto').forEach(function(b){
    b.addEventListener('click', function(){
      var estado = b.closest('.libro').querySelector('.estado');
      b.disabled = true;
      estado.className = 'estado';
      estado.textContent = 'Mandando…';
      var xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/pedidos/${order.id}/adjunto/' + b.getAttribute('data-i') + '?token=${token}');
      xhr.onload = function(){
        var r = {}; try { r = JSON.parse(xhr.responseText); } catch (e) {}
        if (xhr.status === 200) {
          estado.textContent = 'Listo: te lo mandamos a ${esc(correoOculto(order.email))}. Revisa también spam o promociones.';
          b.textContent = 'Enviado';
        } else {
          estado.className = 'estado error';
          estado.textContent = r.error || 'No se pudo mandar. Intenta de nuevo o escríbenos por WhatsApp.';
          b.disabled = false;
        }
      };
      xhr.onerror = function(){ estado.className = 'estado error'; estado.textContent = 'Sin conexión. Intenta de nuevo.'; b.disabled = false; };
      xhr.send();
    });
  });

  var elegido = document.querySelector('.libro.elegido');
  if (elegido && elegido.scrollIntoView) elegido.scrollIntoView({ block: 'center' });
})();
</script>
</body></html>`;
}

module.exports = { paginaDescargas };
