/* ---------------------------------------------------------------------------
 * Levent · seguimiento de Meta Ads (lado navegador)
 *
 * Este archivo hace tres cosas:
 *
 *   1. Carga el Meta Pixel con el ID que le da el servidor (nunca esta escrito
 *      a mano en el HTML, asi se cambia de Pixel sin volver a desplegar).
 *   2. Guarda de donde vino el visitante (utm_*, fbclid) y lo conserva mientras
 *      navega. Sin esto, alguien que llega del anuncio, se va a WhatsApp y
 *      regresa a comprar aparece como trafico directo y la campana se queda sin
 *      credito por una venta que si genero.
 *   3. Dispara cada conversion DOS veces con el mismo `eventID`: una por el
 *      Pixel y otra por la Conversions API del servidor. Meta ve las dos, las
 *      reconoce como la misma y se queda con una sola.
 *
 * Todo lo publico cuelga de `window.Levent`.
 * ------------------------------------------------------------------------- */

(function () {
  'use strict';

  var CLAVE_ATRIBUCION = 'levent_atribucion';
  var DIAS_ATRIBUCION = 30;

  // ---- Atribucion: de donde llego esta persona ---------------------------

  function leerParametros() {
    var params = new URLSearchParams(window.location.search);
    var campos = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid'];
    var encontrado = {};
    var hayAlguno = false;
    campos.forEach(function (campo) {
      var valor = params.get(campo);
      if (valor) {
        encontrado[campo] = valor.slice(0, 255);
        hayAlguno = true;
      }
    });
    return hayAlguno ? encontrado : null;
  }

  function guardarAtribucion(datos) {
    try {
      localStorage.setItem(CLAVE_ATRIBUCION, JSON.stringify({ datos: datos, guardadoEn: Date.now() }));
    } catch (e) {
      /* Navegacion privada o almacenamiento lleno: se sigue sin persistir. */
    }
  }

  function recuperarAtribucion() {
    try {
      var crudo = localStorage.getItem(CLAVE_ATRIBUCION);
      if (!crudo) return {};
      var guardado = JSON.parse(crudo);
      // Meta atribuye por defecto a 7 dias de clic; 30 dias cubre de sobra y
      // evita que un clic viejo se lleve el credito de una visita nueva.
      if (Date.now() - guardado.guardadoEn > DIAS_ATRIBUCION * 864e5) {
        localStorage.removeItem(CLAVE_ATRIBUCION);
        return {};
      }
      return guardado.datos || {};
    } catch (e) {
      return {};
    }
  }

  // La atribucion de esta visita gana sobre la guardada: si vuelve a hacer clic
  // en otro anuncio, el credito es del anuncio nuevo.
  var atribucionActual = leerParametros();
  if (atribucionActual) guardarAtribucion(atribucionActual);
  var atribucion = atribucionActual || recuperarAtribucion();

  function leerCookie(nombre) {
    var partes = ('; ' + document.cookie).split('; ' + nombre + '=');
    return partes.length === 2 ? partes.pop().split(';').shift() : '';
  }

  function atribucionCompleta() {
    return {
      utm_source: atribucion.utm_source || '',
      utm_medium: atribucion.utm_medium || '',
      utm_campaign: atribucion.utm_campaign || '',
      utm_content: atribucion.utm_content || '',
      utm_term: atribucion.utm_term || '',
      fbclid: atribucion.fbclid || '',
      // Las pone el propio Pixel; identifican el navegador y el clic del anuncio.
      fbp: leerCookie('_fbp'),
      fbc: leerCookie('_fbc'),
      landing: window.location.href.split('#')[0],
    };
  }

  // ---- Identificadores de evento -----------------------------------------

  function nuevoEventId(prefijo) {
    if (window.crypto && crypto.randomUUID) return prefijo + '.' + crypto.randomUUID();
    return prefijo + '.' + Date.now() + '.' + Math.random().toString(16).slice(2);
  }

  // ---- Carga del Pixel ----------------------------------------------------

  var pixelListo = false;
  var pendientes = [];

  function cargarPixel(pixelId) {
    /* eslint-disable */
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
    n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}
    (window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
    /* eslint-enable */

    window.fbq('init', pixelId);
    pixelListo = true;

    // PageView tambien se manda por el servidor: es la unica forma de saber
    // cuanta gente llego cuando el navegador bloquea el Pixel.
    enviar('PageView', {});

    // Los eventos que ocurrieron antes de que el Pixel terminara de cargar (un
    // clic muy rapido en WhatsApp) se disparan ahora, no se pierden.
    var cola = pendientes;
    pendientes = [];
    cola.forEach(function (item) {
      dispararPixel(item.eventName, item.eventId, item.customData);
    });
  }

  function dispararPixel(eventName, eventId, customData) {
    if (!pixelListo || !window.fbq) {
      pendientes.push({ eventName: eventName, eventId: eventId, customData: customData });
      return;
    }
    window.fbq('track', eventName, customData || {}, { eventID: eventId });
  }

  // ---- Envio del gemelo por el servidor -----------------------------------

  function mandarAlServidor(ruta, cuerpo, usarBeacon) {
    var json = JSON.stringify(cuerpo);
    // sendBeacon sobrevive a que la pagina se cierre en ese mismo instante, que
    // es exactamente lo que pasa al pulsar el boton de WhatsApp.
    if (usarBeacon && navigator.sendBeacon) {
      try {
        navigator.sendBeacon(ruta, new Blob([json], { type: 'application/json' }));
        return Promise.resolve({ ok: true });
      } catch (e) {
        /* Si el navegador no lo acepta, cae al fetch de abajo. */
      }
    }
    return fetch(ruta, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: json,
      keepalive: true,
    })
      .then(function (r) {
        return r.json().catch(function () {
          return {};
        });
      })
      .catch(function () {
        return { ok: false };
      });
  }

  /**
   * Dispara una conversion por los dos caminos con el mismo eventID.
   *
   * @param {string} eventName  Nombre estandar de Meta (Lead, Contact, ...).
   * @param {object} opciones   { persona, value, contentName, contentIds, beacon }
   */
  function enviar(eventName, opciones) {
    opciones = opciones || {};
    var eventId = opciones.eventId || nuevoEventId(eventName.toLowerCase());

    var customData = {};
    if (opciones.contentName) customData.content_name = opciones.contentName;
    if (opciones.contentIds) customData.content_ids = [].concat(opciones.contentIds);
    if (opciones.value) {
      customData.value = Number(opciones.value);
      customData.currency = opciones.currency || 'MXN';
    }

    dispararPixel(eventName, eventId, customData);

    mandarAlServidor(
      '/api/eventos',
      {
        eventName: eventName,
        eventId: eventId,
        persona: opciones.persona || {},
        value: opciones.value,
        contentName: opciones.contentName,
        contentIds: opciones.contentIds,
        atribucion: atribucionCompleta(),
      },
      opciones.beacon
    );

    return eventId;
  }

  /**
   * Manda el formulario de la landing. Guarda el lead y dispara la conversion
   * Lead por los dos caminos.
   */
  function enviarLead(datos) {
    var eventId = nuevoEventId('lead');

    // El Pixel se dispara ANTES de esperar al servidor: si la persona cierra la
    // pestana al ver el mensaje de exito, la conversion ya salio.
    dispararPixel('Lead', eventId, { content_name: datos.interes || 'Formulario de campana' });

    return fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: datos.nombre,
        email: datos.email,
        telefono: datos.telefono,
        mensaje: datos.mensaje,
        interes: datos.interes,
        origen: datos.origen || 'formulario',
        eventId: eventId,
        atribucion: atribucionCompleta(),
      }),
    }).then(function (r) {
      return r.json().then(function (json) {
        if (!r.ok) throw new Error(json.error || 'No se pudo enviar. Intenta de nuevo.');
        return json;
      });
    });
  }

  /**
   * Clic en WhatsApp. Es la conversion mas fragil de medir: el navegador se va
   * a otra app en el mismo instante, asi que el evento se manda con sendBeacon
   * y la navegacion se retrasa lo minimo indispensable.
   */
  function contactoWhatsApp(url, persona) {
    enviar('Contact', { contentName: 'WhatsApp', persona: persona, beacon: true });
    return url;
  }

  window.Levent = {
    track: enviar,
    enviarLead: enviarLead,
    contactoWhatsApp: contactoWhatsApp,
    atribucion: atribucionCompleta,
    nuevoEventId: nuevoEventId,
  };

  // ---- Arranque -----------------------------------------------------------

  fetch('/api/meta/config')
    .then(function (r) {
      return r.json();
    })
    .then(function (config) {
      if (config && config.pixelId) cargarPixel(config.pixelId);
      else console.warn('[Levent] Sin META_PIXEL_ID: la landing funciona, pero la campana no se esta midiendo.');
    })
    .catch(function () {
      /* Sin config no hay Pixel; la landing sigue funcionando igual. */
    });
})();
