// Vida Endulcora: hero oscuro con luces y chispas, cinta de ofertas, entradas al bajar y botones vivos.
(function(){
  function menu(){
    var m = document.getElementById('menuMovil'); if(!m || m.dataset.vida) return; m.dataset.vida = '1';
    var E = { '/':'🏠', '/tienda':'🛍️', '/ebooks':'📚', '/anexos':'📊', '/recetarios':'📖', '/endulcora-en-vivo':'🎥', '/clases-en-vivo':'🎥', '/clase-gratis':'🎁', '/calculadora':'🧮', '/calendario':'📅', '/talleres':'👩‍🍳', '/resenas':'⭐', '/anuncios':'🔥', '/membresia':'💜', '/juego':'🎮', '/biblioteca-clases':'🎬' };
    var aqui = location.pathname.replace(/\/$/,'') || '/';
    m.querySelectorAll(':scope > a').forEach(function(a, k){
      var h = a.getAttribute('href'); if(h === '/anuncios') a.textContent = 'Talleres de la semana';
      var e = document.createElement('span'); e.className = 'vida-emoji'; e.textContent = E[h] || '✨'; a.prepend(e);
      a.style.animationDelay = (k*35)+'ms'; if(h === aqui) a.setAttribute('aria-current','page');
    });
    document.addEventListener('click', function(ev){ if(!m.classList.contains('hidden') && !m.contains(ev.target) && !ev.target.closest('#btnMenu, [onclick*="toggleMenu"]') && typeof toggleMenu === 'function') toggleMenu(); });
  }
  function logo(){
    document.querySelectorAll('img[src*="logo-endulcora"]').forEach(function(im){
      if(im.closest('a, button, [data-sin-link]')) return;
      var a = document.createElement('a'); a.href = '/'; a.setAttribute('aria-label','Ir al inicio'); a.style.display = getComputedStyle(im).display === 'block' ? 'block' : 'inline-block';
      im.before(a); a.appendChild(im);
    });
  }
  function iniciar(){
    menu(); logo();
    var b = document.body; if(!b || b.dataset.vida === 'no' || document.querySelector('.hero-noche')) return;
    var hero = document.querySelector('[data-vida-hero]') || (function(){
      var h1 = document.querySelector('main h1, section h1, body h1'); if(!h1 || h1.closest('.fixed, [role=dialog]')) return null;
      var malo = function(el){ return el.querySelector('form, table, input, select, textarea, img, iframe, video, .grid') || el.offsetHeight > 420; };
      var intro = h1;
      while(intro.parentElement && !malo(intro.parentElement) && intro.parentElement.tagName !== 'MAIN' && intro.parentElement !== b && intro.parentElement.tagName !== 'SECTION') intro = intro.parentElement;
      if(intro === h1 && h1.parentElement && h1.parentElement.children.length > 1 && malo(h1.parentElement)) {
        // junta el titulo con sus hermanos de texto inmediatos (etiqueta arriba, parrafo abajo)
        var w = document.createElement('div'); h1.before(w);
        var prev = w.previousElementSibling; if(prev && !malo(prev) && prev.offsetHeight < 80) w.prepend(prev);
        w.appendChild(h1); var sig = w.nextElementSibling; if(sig && sig.tagName === 'P') w.appendChild(sig);
        intro = w;
      }
      // bloque de arriba (hijo directo de body o main) para meter la banda antes
      var top = intro; while(top.parentElement && top.parentElement !== b && top.parentElement.tagName !== 'MAIN') top = top.parentElement;
      var banda = document.createElement('section'); banda.className = 'vida-banda';
      var dentro = document.createElement('div'); dentro.className = 'mx-auto max-w-6xl px-5 lg:px-8'; banda.appendChild(dentro);
      var fullbleed = top.parentElement.tagName === 'MAIN' ? top.parentElement : top;
      if(top === intro){ fullbleed.tagName === 'MAIN' ? top.before(banda) : top.before(banda); dentro.appendChild(intro); }
      else { (fullbleed.tagName === 'MAIN' ? fullbleed : top).before(banda); dentro.appendChild(intro); }
      return banda;
    })();
    if(hero && !hero.closest('[data-vida="no"]')){
      hero.classList.add('vida-hero');
      [['#7A2E7E','-8%','-10%',420],['#F5A623','70%','55%',360]].forEach(function(l){ var d=document.createElement('div'); d.className='vida-luz'; d.style.cssText='background:'+l[0]+';left:'+l[1]+';top:'+l[2]+';width:'+l[3]+'px;height:'+l[3]+'px;opacity:.45'; hero.prepend(d); });
      var ch = document.createElement('div'); ch.className='vida-chispas'; ch.setAttribute('aria-hidden','true');
      var cs=['#F5A623','#FBF4E9','#C77DCB'];
      for(var i=0;i<10;i++){ var x=document.createElement('i'); x.style.cssText='left:'+(5+i*9.3)+'%;background:'+cs[i%3]+';animation-delay:'+((i*1.7)%9)+'s;animation-duration:'+(11+(i*3)%6)+'s'; ch.appendChild(x); }
      hero.prepend(ch);
      if(!document.querySelector('.cinta, .vida-cinta') && b.dataset.cinta !== 'no' && hero.dataset.cinta !== 'no'){
        var t = '<span>Talleres presenciales</span><b>✦</b><span>Nativitas y División</span><b>✦</b><span>Aparta con $400</span><b>✦</b><span>Club Endulcora · 2 talleres al mes a $600</span><b>✦</b><span>eBooks $150</span><b>✦</b>';
        var c = document.createElement('div'); c.className='vida-cinta'; c.setAttribute('aria-hidden','true'); c.innerHTML='<div>'+t+t+'</div>'; hero.after(c);
      }
      var cta = hero.querySelector('a.bg-flama, button.bg-flama'); if(cta) cta.classList.add('vida-latido');
    }
    var io = 'IntersectionObserver' in window ? new IntersectionObserver(function(es){ es.forEach(function(e){ if(e.isIntersecting){ e.target.classList.add('vida-visible'); io.unobserve(e.target); } }); }, { rootMargin:'0px 0px -8% 0px' }) : null;
    function animar(raiz){
      raiz.querySelectorAll('section h2, section .grid > *, main .grid > *').forEach(function(el, k){
        if(el.classList.contains('vida-aparece') || el.closest('.vida-hero') || el.closest('.reveal') || el.classList.contains('reveal') || el.closest('[role=dialog], .fixed')) return;
        if(el.getBoundingClientRect().top < innerHeight) return;
        el.classList.add('vida-aparece'); el.style.transitionDelay = ((k%4)*80)+'ms'; io ? io.observe(el) : el.classList.add('vida-visible');
      });
      raiz.querySelectorAll('a[class*="rounded-2xl"], a[class*="rounded-3xl"], article, .grid > a, .grid > div[class*="rounded-"]').forEach(function(el){ if(!el.closest('.fixed')) el.classList.add('vida-tarjeta'); });
      raiz.querySelectorAll('a[class*="rounded-full"], button[class*="rounded-full"]').forEach(function(el){ if(el.offsetWidth > 60) el.classList.add('vida-boton'); });
    }
    animar(document);
    var pend; new MutationObserver(function(){ clearTimeout(pend); pend = setTimeout(function(){ animar(document); }, 250); }).observe(b, { childList:true, subtree:true });
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();

// ---- App de Endulcora: instalar y activar avisos (16 nov 2026) ----
(function(){
  var ua = navigator.userAgent || '';
  var esIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var instalada = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  var promptInstalar = null;
  var soportaPush = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(function(){});
  window.addEventListener('beforeinstallprompt', function(e){ e.preventDefault(); promptInstalar = e; });
  window.addEventListener('appinstalled', function(){ instalada = true; setTimeout(function(){ activarAvisos(); }, 800); });

  function b64(s){ var p = '='.repeat((4 - s.length % 4) % 4); var r = atob((s + p).replace(/-/g,'+').replace(/_/g,'/')); return Uint8Array.from(r, function(c){ return c.charCodeAt(0); }); }

  function activarAvisos(){
    if (!soportaPush) return Promise.resolve(false);
    return Notification.requestPermission().then(function(p){
      if (p !== 'granted') return false;
      return Promise.all([navigator.serviceWorker.ready, fetch('/api/push/clave').then(function(r){ return r.json(); })]).then(function(x){
        var reg = x[0], clave = x[1].clave; if (!clave) return false;
        return reg.pushManager.getSubscription().then(function(s){
          var nueva = function(){ return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(clave) }); };
          if(!s) return nueva();
          // Si la suscripcion se hizo con otra llave, se rehace (si no, el aviso nunca llega).
          try { var k = s.options && s.options.applicationServerKey; if(k){ var a = new Uint8Array(k), c = b64(clave); var igual = a.length === c.length && a.every(function(v,i){ return v === c[i]; }); if(!igual) return s.unsubscribe().then(nueva); } } catch(_){}
          return s;
        })
          .then(function(sub){ return fetch('/api/push/suscribir', { method:'POST', headers:{'Content-Type':'application/json'}, credentials:'same-origin', body: JSON.stringify({ subscription: sub, plataforma: esIOS ? 'ios' : (/android/i.test(ua) ? 'android' : 'compu') }) }); })
          .then(function(){ try{ localStorage.setItem('endulcoraAvisos','1'); }catch(e){} aviso('🎉 ¡Listo! Te avisaremos de talleres nuevos y clases en vivo.'); return true; });
      });
    }).catch(function(){ return false; });
  }
  window.endulcoraActivarAvisos = activarAvisos;

  function aviso(txt, boton, accion){
    var v = document.querySelector('.app-aviso-flotante'); if (v) v.remove();
    var d = document.createElement('div'); d.className = 'app-aviso-flotante'; d.innerHTML = '<span style="flex:1">'+txt+'</span>';
    if (boton){ var b = document.createElement('button'); b.textContent = boton; b.onclick = function(){ d.remove(); accion(); }; d.appendChild(b); }
    document.body.appendChild(d); setTimeout(function(){ d.remove(); }, boton ? 15000 : 5000);
  }

  function hoja(html){
    var m = document.createElement('div'); m.className = 'app-modal'; m.innerHTML = '<div class="app-hoja" role="dialog" aria-modal="true">'+html+'<button type="button" class="app-cerrar">Ahora no</button></div>';
    m.addEventListener('click', function(e){ if (e.target === m || e.target.classList.contains('app-cerrar')) m.remove(); });
    document.body.appendChild(m); return m;
  }
  var BENEFICIOS = '<div class="app-beneficios"><span>🔔 Talleres nuevos</span><span>🎥 Clases en vivo</span><span>⏳ Últimos lugares</span><span>🛍️ Compra en 1 toque</span></div>';

  function instalar(){
    if (instalada){ activarAvisos().then(function(ok){ if(!ok) aviso('Activa las notificaciones de Endulcora en los ajustes de tu teléfono.'); }); return; }
    if (promptInstalar){
      promptInstalar.prompt();
      promptInstalar.userChoice.then(function(r){ promptInstalar = null; if (r.outcome === 'accepted') activarAvisos(); });
      return;
    }
    if (esIOS){
      hoja('<p style="font-size:2rem">📲</p><h3>Instala la app de Endulcora en tu iPhone</h3><p style="margin-top:.4rem;font-size:.9rem;color:rgba(27,7,32,.7)">Es gratis y tarda 10 segundos. Ábrela desde Safari:</p>'+
        '<ol><li><b>1</b><span>Toca el botón <strong>Compartir</strong> <span style="font-size:1.1rem">⬆️</span> abajo de la pantalla.</span></li><li><b>2</b><span>Elige <strong>«Agregar a inicio»</strong> ➕.</span></li><li><b>3</b><span>Abre <strong>Endulcora</strong> desde tu pantalla y acepta los avisos.</span></li></ol>'+BENEFICIOS);
      return;
    }
    var m = hoja('<p style="font-size:2rem">🔔</p><h3>Recibe los avisos de Endulcora</h3><p style="margin-top:.4rem;font-size:.9rem;color:rgba(27,7,32,.7)">Te avisamos de talleres nuevos, clases en vivo y lugares que se acaban. Para instalarla como app, en el menú de tu navegador elige <strong>«Instalar app»</strong> o <strong>«Agregar a pantalla de inicio»</strong>.</p>'+BENEFICIOS+'<button type="button" class="app-boton">🔔 Activar avisos</button>');
    m.querySelector('.app-boton').onclick = function(){ m.remove(); activarAvisos(); };
  }

  function listo(){
    document.querySelectorAll('#btnInstalarApp, [data-instalar-app]').forEach(function(b){
      b.addEventListener('click', instalar);
      if (instalada) b.innerHTML = '<span class="boton-app-icono" aria-hidden="true">🔔</span><span class="hidden sm:inline">Activar avisos</span><span class="sm:hidden">Avisos</span>';
    });
    var yaAvisos = false; try { yaAvisos = localStorage.getItem('endulcoraAvisos') === '1'; } catch(e){}
    if (instalada && soportaPush && Notification.permission === 'granted') { navigator.serviceWorker.ready.then(function(reg){ activarAvisos(); }); document.querySelectorAll('#btnInstalarApp').forEach(function(b){ b.style.display='none'; }); }
    else if (instalada && soportaPush && Notification.permission === 'default') {
      // Al abrir la app se pide el permiso solo (ventana del sistema «Permitir»).
      // Si el telefono exige un toque, se pide con el primer toque en cualquier parte.
      activarAvisos();
      var alTocar = function(){ document.removeEventListener('pointerdown', alTocar, true); if (Notification.permission === 'default') activarAvisos(); };
      document.addEventListener('pointerdown', alTocar, true);
      if (!yaAvisos) setTimeout(function(){ if (Notification.permission === 'default') aviso('🔔 Activa los avisos para enterarte de talleres nuevos y clases en vivo.', 'Activar', activarAvisos); }, 4000);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', listo); else listo();
})();
