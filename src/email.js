const { Resend } = require('resend');

function resendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
}

function formatoMonto(n) {
  return Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

async function enviarCorreoConfirmacionCompra({ to, order, siteUrl, numeroWhatsapp }) {
  const client = resendClient();
  if (!client) throw new Error('El envío de correos todavía no está configurado.');

  const from = process.env.RESEND_FROM || 'Endulcora <onboarding@resend.dev>';

  const filasHtml = (order.items || [])
    .map((item, i) => {
      const nombre = item.titulo || 'Artículo';
      const subtotal = formatoMonto(item.precio * item.cantidad);
      let accion = '';
      if (item.tipo === 'curso') {
        accion = `<p style="margin:4px 0 0;font-size:13px;color:#7A2E7E;">Te contactaremos por WhatsApp (${numeroWhatsapp || ''}) para agendar tu clase.</p>`;
      } else if (item.archivoDisponible) {
        const url = `${siteUrl}/api/pedidos/${order.id}/descarga/${i}?token=${order.descargaToken}`;
        accion = `<p style="margin:8px 0 0;"><a href="${url}" style="background:#F5A623;color:#1B0720;padding:8px 18px;border-radius:999px;text-decoration:none;font-weight:700;font-size:13px;">Descargar</a></p>`;
      } else {
        accion = `<p style="margin:4px 0 0;font-size:13px;color:#9C9C9C;">Te lo enviaremos pronto a este correo.</p>`;
      }
      return `
        <tr>
          <td style="padding:14px 0;border-bottom:1px solid #F1E3CC;">
            <p style="margin:0;font-weight:700;color:#1B0720;">${item.cantidad}× ${nombre}</p>
            <p style="margin:2px 0 0;font-size:13px;color:#9C9C9C;">$${subtotal} MXN</p>
            ${accion}
          </td>
        </tr>`;
    })
    .join('');

  await client.emails.send({
    from,
    to,
    subject: '¡Tu pago fue confirmado! · Endulcora',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1B0720;">
        <p style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#7A2E7E;">Endulcora</p>
        <h1 style="font-size:20px;color:#4E1454;">¡Gracias por tu compra!</h1>
        <p style="font-size:14px;line-height:1.6;">Confirmamos tu pago por un total de <strong>$${formatoMonto(order.total)} MXN</strong>.</p>
        <table style="width:100%;border-collapse:collapse;margin-top:12px;">${filasHtml}</table>
        <p style="margin-top:24px;font-size:12px;color:#9C9C9C;">¿Dudas con tu pedido? Escríbenos por WhatsApp al ${numeroWhatsapp || ''}.</p>
      </div>
    `,
  });
}

async function enviarCorreoRevistaMensual({ to, nombre, url, mes }) {
  const client = resendClient();
  if (!client) throw new Error('El envío de correos todavía no está configurado.');

  const from = process.env.RESEND_FROM || 'Endulcora <onboarding@resend.dev>';

  await client.emails.send({
    from,
    to,
    subject: `Tu revista mensual de regalo de ${mes} · Endulcora`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1B0720;">
        <p style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#7A2E7E;">Endulcora</p>
        <h1 style="font-size:20px;color:#4E1454;">¡Gracias por ser parte de nuestra comunidad!</h1>
        <p style="font-size:14px;line-height:1.6;">Hola${nombre ? ` ${nombre}` : ''}, como agradecimiento por tener tu cuenta con nosotros te regalamos tu revista mensual de <strong>${mes}</strong>, completamente gratis.</p>
        <p style="margin-top:16px;"><a href="${url}" style="background:#F5A623;color:#1B0720;padding:10px 22px;border-radius:999px;text-decoration:none;font-weight:700;font-size:13px;">Descargar revista</a></p>
        <p style="margin-top:24px;font-size:12px;color:#9C9C9C;">Recibes este correo porque tienes una cuenta en endulcora.com.</p>
      </div>
    `,
  });
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Correo de campaña masiva (a la lista de contactos importada en /admin).
// Incluye los headers List-Unsubscribe / List-Unsubscribe-Post (RFC 8058):
// Gmail y Yahoo exigen esto para no marcar como spam a quien manda correo en
// volumen, y con eso el "darse de baja" es de un clic, sin que el cliente de
// correo tenga que abrir el link.
async function enviarCorreoCampana({ to, nombre, asunto, cuerpoHtml, unsubscribeUrl }) {
  const client = resendClient();
  if (!client) throw new Error('El envío de correos todavía no está configurado.');

  const from = process.env.RESEND_FROM || 'Endulcora <onboarding@resend.dev>';

  await client.emails.send({
    from,
    to,
    subject: asunto,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1B0720;">
        <p style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#7A2E7E;">Endulcora</p>
        ${nombre ? `<p style="font-size:14px;">Hola ${escapeHtml(nombre)},</p>` : ''}
        <div style="font-size:14px;line-height:1.6;">${cuerpoHtml}</div>
        <p style="margin-top:28px;font-size:11px;color:#9C9C9C;">Recibiste este correo porque estás en la lista de contactos de Endulcora.<br><a href="${unsubscribeUrl}" style="color:#9C9C9C;">Dejar de recibir estos correos</a></p>
      </div>
    `,
    headers: {
      'List-Unsubscribe': `<${unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  });
}

module.exports = { enviarCorreoConfirmacionCompra, enviarCorreoRevistaMensual, enviarCorreoCampana };
