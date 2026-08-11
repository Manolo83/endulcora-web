// Aviso por correo de cada lead nuevo, para no depender de entrar a /admin.
// Si RESEND_API_KEY no esta configurada, todo el sitio sigue funcionando igual:
// el lead se guarda y se ve en el panel, solo que no llega el correo.

const { Resend } = require('resend');
const { MARCA } = require('./config');

function cliente() {
  const apiKey = process.env.RESEND_API_KEY;
  return apiKey ? new Resend(apiKey) : null;
}

function escapar(texto) {
  return String(texto || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

async function enviarAvisoLead({ lead, siteUrl }) {
  const resend = cliente();
  const para = process.env.LEADS_EMAIL_TO;
  if (!resend || !para) return { enviado: false };

  const filas = [
    ['Nombre', lead.nombre],
    ['WhatsApp / telefono', lead.telefono],
    ['Correo', lead.email],
    ['Interes', lead.interes],
    ['Mensaje', lead.mensaje],
    ['Campana', lead.utm_campaign],
    ['Anuncio', lead.utm_content],
    ['Fuente', lead.utm_source],
  ]
    .filter(([, valor]) => valor)
    .map(([etiqueta, valor]) => `<tr><td style="padding:6px 12px 6px 0;color:#666">${escapar(etiqueta)}</td><td style="padding:6px 0"><strong>${escapar(valor)}</strong></td></tr>`)
    .join('');

  const telefonoWa = String(lead.telefono || '').replace(/\D/g, '');

  await resend.emails.send({
    from: process.env.RESEND_FROM || `${MARCA} <onboarding@resend.dev>`,
    to: [para],
    subject: `Nuevo lead de ${MARCA}: ${lead.nombre || lead.telefono || 'sin nombre'}`,
    html: `
      <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px">
        <h2 style="margin:0 0 4px">Nuevo lead de la campana</h2>
        <p style="margin:0 0 16px;color:#666">Llego por la landing de ${escapar(MARCA)}.</p>
        <table style="border-collapse:collapse;font-size:14px">${filas}</table>
        ${telefonoWa ? `<p style="margin-top:20px"><a href="https://wa.me/${telefonoWa}" style="background:#111;color:#fff;padding:11px 20px;border-radius:999px;text-decoration:none;display:inline-block">Escribirle por WhatsApp</a></p>` : ''}
        <p style="margin-top:20px;font-size:13px;color:#888">Ver todos los leads: <a href="${siteUrl}/admin">${siteUrl}/admin</a></p>
      </div>
    `,
  });

  return { enviado: true };
}

module.exports = { enviarAvisoLead };
