const express = require('express');
const store = require('../store');
const meta = require('../meta');
const { SITE_URL } = require('../config');
const { enviarAvisoLead } = require('../email');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_TEXTO = 500;

function texto(valor, max = 120) {
  return String(valor ?? '').trim().slice(0, max);
}

// Lo que el navegador manda sobre el origen del visitante. Se saneta aqui
// porque viene de la URL y por lo tanto es texto de un tercero.
function leerAtribucion(body = {}) {
  const a = body.atribucion || {};
  return {
    utm_source: texto(a.utm_source),
    utm_medium: texto(a.utm_medium),
    utm_campaign: texto(a.utm_campaign),
    utm_content: texto(a.utm_content),
    utm_term: texto(a.utm_term),
    fbclid: texto(a.fbclid, 255),
    fbp: texto(a.fbp, 255),
    fbc: texto(a.fbc, 255),
    landing: texto(a.landing, 300),
  };
}

// ---- Contenido publico de la landing ----

router.get('/content', (req, res) => {
  res.json(store.getContent());
});

router.get('/ofertas', (req, res) => {
  res.json(store.getOfertas(true));
});

// El Pixel ID es publico por naturaleza (va en el HTML de cualquier sitio con
// Pixel). El token de la Conversions API NO se expone nunca: vive solo aqui.
router.get('/meta/config', (req, res) => {
  res.json({ pixelId: meta.pixelId(), capiActiva: meta.estaConfigurado() });
});

// ---- Conversion 1: Lead (formulario de la landing) ----

router.post('/leads', async (req, res) => {
  const body = req.body || {};
  const nombre = texto(body.nombre, 120);
  const telefono = texto(body.telefono, 30);
  const email = texto(body.email, 160).toLowerCase();
  const mensaje = texto(body.mensaje, MAX_TEXTO);
  const interes = texto(body.interes, 160);

  // Se pide al menos una forma de contactarlo: sin eso el lead no sirve para
  // nadie, ni para Levent ni para el emparejamiento de Meta.
  const telefonoDigitos = telefono.replace(/\D/g, '');
  const emailValido = EMAIL_RE.test(email);
  if (telefonoDigitos.length < 10 && !emailValido) {
    return res.status(400).json({ error: 'Escribe un WhatsApp a 10 digitos o un correo valido.' });
  }
  if (!nombre) {
    return res.status(400).json({ error: 'Escribe tu nombre.' });
  }

  const atribucion = leerAtribucion(body);
  const lead = store.addLead({
    nombre,
    email: emailValido ? email : '',
    telefono,
    mensaje,
    interes,
    origen: texto(body.origen, 40) || 'formulario',
    ...atribucion,
  });

  // El navegador genera el event_id y manda el mismo por fbq(); si no lo mando
  // (bloqueador de anuncios), se genera aqui y el evento existe igual.
  const eventId = texto(body.eventId, 100) || meta.nuevoEventId('lead');
  const eventSourceUrl = atribucion.landing || `${SITE_URL}/`;

  // La respuesta al visitante no espera a Meta: el formulario se siente
  // instantaneo y el evento sale en paralelo.
  res.status(201).json({ ok: true, leadId: lead.id, eventId });

  const resultado = await meta.enviarEvento({
    eventName: 'Lead',
    eventId,
    eventSourceUrl,
    persona: { nombre, email: emailValido ? email : '', telefono, externalId: `lead-${lead.id}` },
    navegador: meta.datosDelNavegador(req, { fbp: atribucion.fbp, fbc: atribucion.fbc, fbclid: atribucion.fbclid }),
    customData: {
      content_name: interes || 'Formulario de campana',
      // Un valor por lead deja que Meta optimice hacia los leads que valen mas,
      // no solo hacia el volumen. Se configura con META_VALOR_LEAD.
      ...(process.env.META_VALOR_LEAD
        ? { value: Number(process.env.META_VALOR_LEAD), currency: process.env.MONEDA || 'MXN' }
        : {}),
    },
  });

  store.updateLead(lead.id, { metaEnviado: resultado.ok, metaEventId: eventId });
  store.registrarEventoMeta({ eventName: 'Lead', eventId, ok: resultado.ok, motivo: resultado.motivo });

  enviarAvisoLead({ lead, siteUrl: SITE_URL }).catch((err) => {
    console.error(`[leads] No se pudo avisar por correo del lead ${lead.id}:`, err.message);
  });
});

// ---- Conversiones 2 y 3: los demas eventos del navegador ----
// El navegador ya disparo el evento con fbq(); este endpoint manda el gemelo
// por la Conversions API con el mismo event_id para que Meta lo deduplique.

router.post('/eventos', async (req, res) => {
  const body = req.body || {};
  const eventName = texto(body.eventName, 60);

  if (!meta.EVENTOS_PERMITIDOS.has(eventName)) {
    return res.status(400).json({ error: 'Evento no permitido.' });
  }

  const atribucion = leerAtribucion(body);
  const eventId = texto(body.eventId, 100) || meta.nuevoEventId(eventName.toLowerCase());
  const persona = body.persona || {};

  res.status(202).json({ ok: true, eventId });

  const customData = {};
  if (body.contentName) customData.content_name = texto(body.contentName, 160);
  if (body.contentIds) customData.content_ids = [].concat(body.contentIds).slice(0, 10).map((v) => texto(v, 60));
  if (Number.isFinite(Number(body.value)) && Number(body.value) > 0) {
    customData.value = Number(body.value);
    customData.currency = process.env.MONEDA || 'MXN';
  }

  const resultado = await meta.enviarEvento({
    eventName,
    eventId,
    eventSourceUrl: atribucion.landing || `${SITE_URL}/`,
    persona: {
      nombre: texto(persona.nombre, 120),
      email: texto(persona.email, 160).toLowerCase(),
      telefono: texto(persona.telefono, 30),
    },
    navegador: meta.datosDelNavegador(req, { fbp: atribucion.fbp, fbc: atribucion.fbc, fbclid: atribucion.fbclid }),
    customData,
  });

  store.registrarEventoMeta({
    eventName,
    eventId,
    ok: resultado.ok,
    motivo: resultado.motivo,
    valor: customData.value ?? null,
  });
});

module.exports = router;
