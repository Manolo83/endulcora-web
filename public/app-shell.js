// App de Endulcora (17 nov 2026): cuando el sitio se abre como app instalada,
// se ve con diseño de app: sin el encabezado ni el pie de la web y con una
// barra de íconos fija abajo. En el navegador la web se ve igual que siempre.
(function(){
  var instalada = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true || /[?&]modo=app\b/.test(location.search);
  if (!instalada) return;
  var ruta = location.pathname.replace(/\/+$/, '') || '/';
  if (ruta === '/') { location.replace('/app' + location.search); return; }
  document.documentElement.classList.add('modo-app');

  var css = document.createElement('style');
  css.textContent =
    'html.modo-app body > header, html.modo-app body > footer, html.modo-app header.sticky, html.modo-app #whatsappFlotante, html.modo-app .whatsapp-flotante{display:none!important}' +
    'html.modo-app body{padding-bottom:calc(84px + env(safe-area-inset-bottom))}' +
    'html.modo-app .nav-portal{bottom:calc(72px + env(safe-area-inset-bottom))!important}' +
    '.app-barra{position:fixed;left:0;right:0;bottom:0;z-index:9990;background:#fff;display:flex;justify-content:space-around;align-items:center;height:72px;padding-bottom:env(safe-area-inset-bottom);box-shadow:0 -2px 14px rgba(27,7,32,.09);font-family:Poppins,system-ui,sans-serif}' +
    '.app-barra a{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;min-height:56px;justify-content:center;font-size:10.5px;color:#6b5a70;text-decoration:none;-webkit-tap-highlight-color:transparent}' +
    '.app-barra a svg{width:24px;height:24px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}' +
    '.app-barra a.activo{color:#4E1454;font-weight:600}.app-barra a.activo svg{stroke-width:2.4}' +
    '.app-volver{position:fixed;top:calc(10px + env(safe-area-inset-top));left:12px;z-index:9990;width:44px;height:44px;border-radius:22px;border:none;background:rgba(255,255,255,.95);box-shadow:0 2px 10px rgba(27,7,32,.15);display:flex;align-items:center;justify-content:center}' +
    'html.modo-app .vida-hero, html.modo-app .vida-cinta{display:none!important}' +
    'html.modo-app .nav-portal{position:sticky!important;top:0!important;bottom:auto!important;margin-bottom:16px}' +
    '.app-titulo{padding:calc(16px + env(safe-area-inset-top)) 20px 8px;background:#FBF4E9;font-family:"Baloo 2",Poppins,sans-serif;font-weight:800;font-size:26px;line-height:1.15;color:#1B0720}' +
    '.app-titulo.con-volver{padding-left:68px;padding-top:calc(18px + env(safe-area-inset-top))}' +
    '.app-titulo small{display:block;font-family:Poppins,sans-serif;font-weight:400;font-size:13px;color:#5C2360;margin-top:2px}' +
    '.app-volver svg{width:22px;height:22px;stroke:#4E1454;fill:none;stroke-width:2.4;stroke-linecap:round}';
  document.head.appendChild(css);

  var I = {
    inicio: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    talleres: '<path d="M6 13.9A4 4 0 0 1 7 6a5 5 0 0 1 10 0 4 4 0 0 1 1 7.9V20H6z"/><path d="M6 17h12"/>',
    calendario: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    membresia: '<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/>',
    whatsapp: '<path d="M21 12a8 8 0 0 1-11.7 7.1L3 21l1.9-6.3A8 8 0 1 1 21 12z"/>'
  };
  var TABS = [
    ['inicio', 'Inicio', '/app', /^\/app$/],
    ['talleres', 'Talleres', '/app/talleres', /^\/(app\/talleres|talleres|taller|inscripcion-taller)/],
    ['calendario', 'Calendario', '/calendario', /^\/calendario/],
    ['membresia', 'Membresía', '/membresia', /^\/membresia/],
    ['whatsapp', 'WhatsApp', 'https://wa.me/5215575933916?text=' + encodeURIComponent('Hola, vengo de la app de Endulcora y quiero preguntar por un taller'), null]
  ];

  function montar(){
    if (document.querySelector('.app-barra')) return;
    var nav = document.createElement('nav'); nav.className = 'app-barra'; nav.setAttribute('aria-label', 'Secciones de la app');
    nav.innerHTML = TABS.map(function(t){
      var activo = t[3] && t[3].test(ruta);
      return '<a href="' + t[2] + '"' + (activo ? ' class="activo" aria-current="page"' : '') + (t[0] === 'whatsapp' ? ' target="_blank" rel="noopener"' : '') + '><svg viewBox="0 0 24 24" aria-hidden="true">' + I[t[0]] + '</svg>' + t[1] + '</a>';
    }).join('');
    document.body.appendChild(nav);
    var hero = document.querySelector('.vida-hero');
    if (hero) {
      var h1 = hero.querySelector('h1'), t = document.createElement('div'); t.className = 'app-titulo';
      t.textContent = h1 ? (h1.innerText || h1.textContent).replace(/\s+/g, ' ').trim() : '';
      var sub = { '/talleres': 'Presenciales en Nativitas y División', '/calendario': 'Todas las fechas, mes por mes' }[ruta];
      if (sub) { var sm = document.createElement('small'); sm.textContent = sub; t.appendChild(sm); }
      if (t.textContent) hero.before(t);
    }
    var esPrincipal = TABS.some(function(t){ return t[3] && t[3].test(ruta) && ruta === t[2]; });
    if (!esPrincipal) {
      var v = document.createElement('button'); v.className = 'app-volver'; v.type = 'button'; v.setAttribute('aria-label', 'Regresar');
      v.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>';
      v.onclick = function(){ if (history.length > 1) history.back(); else location.href = '/app'; };
      document.body.appendChild(v);
      var tt = document.querySelector('.app-titulo'); if (tt) tt.classList.add('con-volver');
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar); else montar();
})();
