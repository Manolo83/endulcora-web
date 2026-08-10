// Avisos por correo a Endulcora cuando el bot necesita que una persona siga.
//
// El bot nunca cobra ni valida pagos, asi que estos correos son el punto donde
// la conversacion cambia de manos. Van con el hilo del chat incluido para no
// tener que abrir el panel y reconstruir de que se trataba.

const { Resend } = require('resend');
const store = require('../store');
const { SITE_URL } = require('../config');

function resendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
}

const NOMBRE_CANAL = {
  whatsapp: 'WhatsApp',
  messenger: 'Messenger',
  instagram: 'Instagram',
};

function escapar(texto) {
  return String(texto || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function hiloHtml(mensajes) {
  if (!mensajes || !mensajes.length) return '<p style="color:#9C9C9C;">(sin mensajes)</p>';
  return mensajes
    .map((m) => {
      const esCliente = m.rol === 'cliente';
      const quien = esCliente ? 'Cliente' : 'Endulcorito';
      const fondo = esCliente ? '#FFF6E8' : '#F4EFF6';
      return `
        <div style="background:${fondo};border-radius:10px;padding:10px 12px;margin:6px 0;">
          <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#7A2E7E;">${quien}</p>
          <p style="margin:0;font-size:13px;line-height:1.5;color:#1B0720;white-space:pre-wrap;">${escapar(m.texto)}</p>
        </div>`;
    })
    .join('');
}

function contactoHtml(contacto) {
  const canal = NOMBRE_CANAL[contacto.canal] || contacto.canal;
  const quien = contacto.telefono || contacto.externo_id;
  const enlace =
    contacto.canal === 'whatsapp' && contacto.telefono
      ? `<p style="margin:8px 0 0;"><a href="https://wa.me/${encodeURIComponent(contacto.telefono)}" style="background:#3F8F5F;color:#fff;padding:9px 18px;border-radius:999px;text-decoration:none;font-weight:700;font-size:13px;">Abrir WhatsApp</a></p>`
      : '';
  return `
    <p style="margin:0;font-size:14px;"><strong>${escapar(contacto.nombre || 'Sin nombre')}</strong></p>
    <p style="margin:2px 0 0;font-size:13px;color:#9C9C9C;">${escapar(canal)} · ${escapar(quien)}</p>
    ${enlace}`;
}

async function enviar({ asunto, encabezado, color, cuerpo }) {
  const client = resendClient();
  const para = store.getBotConfig().correoNotificaciones;
  if (!client || !para) {
    console.warn('[bot] No se envió la notificación: falta RESEND_API_KEY o el correo de avisos.');
    return;
  }
  const from = process.env.RESEND_FROM || 'Endulcora <onboarding@resend.dev>';

  try {
    await client.emails.send({
      from,
      to: para,
      subject: asunto,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1B0720;">
          <p style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#7A2E7E;">Endulcorito · Bot de ventas</p>
          <h1 style="font-size:19px;color:${color};margin:4px 0 16px;">${encabezado}</h1>
          ${cuerpo}
          <p style="margin-top:24px;font-size:12px;color:#9C9C9C;">
            Ver la conversación completa en <a href="${SITE_URL}/admin#seccionBot" style="color:#7A2E7E;">el panel</a>.
          </p>
        </div>`,
    });
  } catch (e) {
    // Un correo que no sale no debe tumbar la conversacion: queda en el panel.
    console.error('[bot] No se pudo enviar la notificación:', e.message);
  }
}

// El cliente llego al final del embudo: ya tiene las instrucciones de pago y
// toca esperar su comprobante.
function avisarSolicitud({ contacto, solicitud, mensajes }) {
  const personas = solicitud.personas;
  return enviar({
    asunto: `Apartado pendiente · ${solicitud.taller} · $${Number(solicitud.anticipo).toLocaleString('es-MX')}`,
    encabezado: 'Ya mandé las instrucciones de pago',
    color: '#3F8F5F',
    cuerpo: `
      ${contactoHtml(contacto)}
      <table style="width:100%;border-collapse:collapse;margin-top:16px;font-size:14px;">
        <tr><td style="padding:6px 0;color:#9C9C9C;">Taller</td><td style="padding:6px 0;text-align:right;"><strong>${escapar(solicitud.taller)}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#9C9C9C;">Fecha y horario</td><td style="padding:6px 0;text-align:right;">${escapar(solicitud.fecha_texto || 'por definir')}</td></tr>
        <tr><td style="padding:6px 0;color:#9C9C9C;">Personas</td><td style="padding:6px 0;text-align:right;">${personas}</td></tr>
        <tr><td style="padding:6px 0;color:#9C9C9C;">Anticipo esperado</td><td style="padding:6px 0;text-align:right;"><strong>$${Number(solicitud.anticipo).toLocaleString('es-MX')} MXN</strong></td></tr>
        <tr><td style="padding:6px 0;color:#9C9C9C;">Saldo el día del taller</td><td style="padding:6px 0;text-align:right;">$${Number(solicitud.saldo).toLocaleString('es-MX')} MXN</td></tr>
      </table>
      <h2 style="font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:#7A2E7E;margin:22px 0 6px;">La conversación</h2>
      ${hiloHtml(mensajes)}`,
  });
}

// El bot se topo con algo que no le toca: lo canalizo y avisa.
function avisarEscalado({ contacto, motivo, mensajes }) {
  return enviar({
    asunto: `Atención personalizada · ${contacto.nombre || contacto.telefono || contacto.externo_id}`,
    encabezado: 'Canalicé a alguien contigo',
    color: '#C1440E',
    cuerpo: `
      ${contactoHtml(contacto)}
      <p style="margin:16px 0 0;font-size:14px;background:#FFF6E8;border-left:3px solid #F5A623;padding:10px 12px;">
        <strong>Motivo:</strong> ${escapar(motivo)}
      </p>
      <p style="margin:12px 0 0;font-size:13px;color:#9C9C9C;">Ya le dije que en un momento lo contactan. El bot dejó de responderle.</p>
      <h2 style="font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:#7A2E7E;margin:22px 0 6px;">La conversación</h2>
      ${hiloHtml(mensajes)}`,
  });
}

module.exports = { avisarSolicitud, avisarEscalado };
