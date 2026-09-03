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

  const { error } = await client.emails.send({
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
  // Resend no lanza una excepcion cuando el envio falla: regresa
  // { data: null, error }. Sin este chequeo, un correo rechazado se veia
  // como "enviado" (nunca se detectaba el error).
  if (error) throw new Error(error.message || 'Resend rechazó el correo.');
}

async function enviarCorreoRevistaMensual({ to, nombre, url, mes }) {
  const client = resendClient();
  if (!client) throw new Error('El envío de correos todavía no está configurado.');

  const from = process.env.RESEND_FROM || 'Endulcora <onboarding@resend.dev>';

  const { error } = await client.emails.send({
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
  if (error) throw new Error(error.message || 'Resend rechazó el correo.');
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Correo de campaña masiva (a la lista de contactos importada en /admin).
// Incluye los headers List-Unsubscribe / List-Unsubscribe-Post (RFC 8058):
// Gmail y Yahoo exigen esto para no marcar como spam a quien manda correo en
// volumen, y con eso el "darse de baja" es de un clic, sin que el cliente de
// correo tenga que abrir el link.
async function enviarCorreoCampana({ to, nombre, asunto, cuerpoHtml, unsubscribeUrl, imagenes, archivos, videoUrl }) {
  const client = resendClient();
  if (!client) throw new Error('El envío de correos todavía no está configurado.');

  const from = process.env.RESEND_FROM || 'Endulcora <onboarding@resend.dev>';

  const imagenesHtml = (imagenes || [])
    .map((url) => `<img src="${url}" alt="" style="display:block;width:100%;max-width:480px;border-radius:14px;margin-bottom:14px;">`)
    .join('');
  const videoHtml = videoUrl
    ? `<p style="margin-top:22px;"><a href="${videoUrl}" style="background:#F5A623;color:#1B0720;padding:10px 22px;border-radius:999px;text-decoration:none;font-weight:700;font-size:13px;display:inline-block;">▶ Ver video</a></p>`
    : '';
  // path: Resend descarga cada archivo de esa URL una sola vez y lo adjunta;
  // asi no hay que mandar los archivos completos en cada peticion a la API.
  const attachments = archivos && archivos.length ? archivos : undefined;

  const { error } = await client.emails.send({
    from,
    to,
    subject: asunto,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1B0720;">
        <p style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#7A2E7E;">Endulcora</p>
        ${imagenesHtml}
        ${nombre ? `<p style="font-size:14px;">Hola ${escapeHtml(nombre)},</p>` : ''}
        <div style="font-size:14px;line-height:1.6;">${cuerpoHtml}</div>
        ${videoHtml}
        <p style="margin-top:28px;font-size:11px;color:#9C9C9C;">Recibiste este correo porque estás en la lista de contactos de Endulcora.<br><a href="${unsubscribeUrl}" style="color:#9C9C9C;">Dejar de recibir estos correos</a></p>
      </div>
    `,
    ...(attachments ? { attachments } : {}),
    headers: {
      'List-Unsubscribe': `<${unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  });
  if (error) throw new Error(error.message || 'Resend rechazó el correo.');
}

// ---- Secuencia del lead magnet (receta gratis a cambio del correo) ----
// Paso 0 se manda de inmediato al suscribirse (desde la propia ruta de
// suscripcion); los pasos 1-3 los manda el programador de automatizaciones
// (src/automatizaciones.js) unos dias despues, para ir acercando a quien se
// suscribio hacia la membresia sin que sea invasivo.
function piePromocional(unsubscribeUrl) {
  return `<p style="margin-top:28px;font-size:11px;color:#9C9C9C;">Recibiste este correo porque te suscribiste en endulcora.com.${unsubscribeUrl ? `<br><a href="${unsubscribeUrl}" style="color:#9C9C9C;">Dejar de recibir estos correos</a>` : ''}</p>`;
}

async function enviarCorreoLeadMagnetPaso0({ to, titulo, url, unsubscribeUrl }) {
  const client = resendClient();
  if (!client) throw new Error('El envío de correos todavía no está configurado.');
  const from = process.env.RESEND_FROM || 'Endulcora <onboarding@resend.dev>';
  const { error } = await client.emails.send({
    from,
    to,
    subject: `${titulo || 'Tu receta de regalo'} · Endulcora`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1B0720;">
        <p style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#7A2E7E;">Endulcora</p>
        <h1 style="font-size:20px;color:#4E1454;">¡Aquí está tu receta!</h1>
        <p style="font-size:14px;line-height:1.6;">Gracias por suscribirte. Como lo prometimos, aquí tienes <strong>${escapeHtml(titulo || 'tu receta de regalo')}</strong>, totalmente gratis.</p>
        <p style="margin-top:16px;"><a href="${url}" style="background:#F5A623;color:#1B0720;padding:10px 22px;border-radius:999px;text-decoration:none;font-weight:700;font-size:13px;">Descargar receta</a></p>
        ${piePromocional(unsubscribeUrl)}
      </div>
    `,
  });
  if (error) throw new Error(error.message || 'Resend rechazó el correo.');
}

async function enviarCorreoLeadMagnetPaso1({ to, siteUrl, unsubscribeUrl }) {
  const client = resendClient();
  if (!client) throw new Error('El envío de correos todavía no está configurado.');
  const from = process.env.RESEND_FROM || 'Endulcora <onboarding@resend.dev>';
  const { error } = await client.emails.send({
    from,
    to,
    subject: '¿Ya hiciste tu receta? Esto es lo que te estás perdiendo',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1B0720;">
        <p style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#7A2E7E;">Endulcora</p>
        <h1 style="font-size:20px;color:#4E1454;">Esa receta fue solo una probadita</h1>
        <p style="font-size:14px;line-height:1.6;">La membresía Endulcora incluye, cada mes:</p>
        <ul style="font-size:14px;line-height:1.8;color:#1B0720;padding-left:20px;">
          <li>Recetario del mes, exclusivo para miembros</li>
          <li>Revista mensual, para leer en línea</li>
          <li>Taller online mensual (video privado)</li>
          <li>Biblioteca completa de talleres grabados</li>
        </ul>
        <p style="font-size:14px;line-height:1.6;">Por $50 MXN al mes. Cancela cuando quieras.</p>
        <p style="margin-top:16px;"><a href="${siteUrl}/membresia" style="background:#F5A623;color:#1B0720;padding:10px 22px;border-radius:999px;text-decoration:none;font-weight:700;font-size:13px;">Conocer la membresía</a></p>
        ${piePromocional(unsubscribeUrl)}
      </div>
    `,
  });
  if (error) throw new Error(error.message || 'Resend rechazó el correo.');
}

async function enviarCorreoLeadMagnetPaso2({ to, siteUrl, unsubscribeUrl }) {
  const client = resendClient();
  if (!client) throw new Error('El envío de correos todavía no está configurado.');
  const from = process.env.RESEND_FROM || 'Endulcora <onboarding@resend.dev>';
  const { error } = await client.emails.send({
    from,
    to,
    subject: 'Lo que están compartiendo las alumnas de Endulcora',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1B0720;">
        <p style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#7A2E7E;">Endulcora</p>
        <h1 style="font-size:20px;color:#4E1454;">No lo decimos solo nosotros</h1>
        <p style="font-size:14px;line-height:1.6;">Cada mes, más alumnas comparten sus piezas y sus talleres en nuestra galería y comunidad — y dejan su reseña sobre lo que aprendieron.</p>
        <p style="margin-top:16px;"><a href="${siteUrl}/resenas" style="background:#F5A623;color:#1B0720;padding:10px 22px;border-radius:999px;text-decoration:none;font-weight:700;font-size:13px;">Leer reseñas</a></p>
        <p style="margin-top:10px;"><a href="${siteUrl}/galeria" style="color:#7A2E7E;text-decoration:none;font-size:13px;font-weight:700;">Ver la galería →</a></p>
        ${piePromocional(unsubscribeUrl)}
      </div>
    `,
  });
  if (error) throw new Error(error.message || 'Resend rechazó el correo.');
}

async function enviarCorreoLeadMagnetPaso3({ to, siteUrl, unsubscribeUrl }) {
  const client = resendClient();
  if (!client) throw new Error('El envío de correos todavía no está configurado.');
  const from = process.env.RESEND_FROM || 'Endulcora <onboarding@resend.dev>';
  const { error } = await client.emails.send({
    from,
    to,
    subject: 'Cada mes que esperas, te pierdes el recetario y el taller de ese mes',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1B0720;">
        <p style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#7A2E7E;">Endulcora</p>
        <h1 style="font-size:20px;color:#4E1454;">¿Te animas a ser miembro?</h1>
        <p style="font-size:14px;line-height:1.6;">El recetario y el taller de este mes ya están disponibles solo para miembros. Por $50 MXN al mes tienes acceso a todo, y puedes cancelar cuando quieras.</p>
        <p style="margin-top:16px;"><a href="${siteUrl}/membresia" style="background:#F5A623;color:#1B0720;padding:10px 22px;border-radius:999px;text-decoration:none;font-weight:700;font-size:13px;">Hacerme miembro</a></p>
        ${piePromocional(unsubscribeUrl)}
      </div>
    `,
  });
  if (error) throw new Error(error.message || 'Resend rechazó el correo.');
}

// Recordatorio unico a quien crea una cuenta (para /membresia, /comunidad,
// etc.) pero nunca llega a suscribirse. Lo manda el programador de
// automatizaciones un par de dias despues del registro.
async function enviarCorreoRecordatorioMembresia({ to, nombre, siteUrl }) {
  const client = resendClient();
  if (!client) throw new Error('El envío de correos todavía no está configurado.');
  const from = process.env.RESEND_FROM || 'Endulcora <onboarding@resend.dev>';
  const { error } = await client.emails.send({
    from,
    to,
    subject: 'Te faltó un paso para ser miembro Endulcora',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1B0720;">
        <p style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#7A2E7E;">Endulcora</p>
        <h1 style="font-size:20px;color:#4E1454;">¡Hola${nombre ? ` ${escapeHtml(nombre)}` : ''}!</h1>
        <p style="font-size:14px;line-height:1.6;">Creaste tu cuenta en Endulcora, pero todavía no te has hecho miembro. Con la membresía tienes, cada mes, recetario, revista, taller online y acceso a toda la biblioteca de talleres grabados — por $50 MXN al mes, cancela cuando quieras.</p>
        <p style="margin-top:16px;"><a href="${siteUrl}/membresia" style="background:#F5A623;color:#1B0720;padding:10px 22px;border-radius:999px;text-decoration:none;font-weight:700;font-size:13px;">Hacerme miembro</a></p>
        <p style="margin-top:24px;font-size:12px;color:#9C9C9C;">Recibiste este correo porque tienes una cuenta en endulcora.com.</p>
      </div>
    `,
  });
  if (error) throw new Error(error.message || 'Resend rechazó el correo.');
}

module.exports = {
  enviarCorreoConfirmacionCompra,
  enviarCorreoRevistaMensual,
  enviarCorreoCampana,
  enviarCorreoLeadMagnetPaso0,
  enviarCorreoLeadMagnetPaso1,
  enviarCorreoLeadMagnetPaso2,
  enviarCorreoLeadMagnetPaso3,
  enviarCorreoRecordatorioMembresia,
};
