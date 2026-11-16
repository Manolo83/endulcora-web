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
