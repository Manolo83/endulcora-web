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
      } else if (item.tipo === 'clase_en_vivo') {
        accion = `<p style="margin:8px 0 0;"><a href="${siteUrl}/clases-en-vivo" style="background:#F5A623;color:#1B0720;padding:8px 18px;border-radius:999px;text-decoration:none;font-weight:700;font-size:13px;">Ver mi acceso</a></p>`;
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

async function enviarCorreoConfirmacionInscripcionTaller({ to, nombre, taller, fecha, sede, horario, siteUrl, numeroWhatsapp }) {
  const client = resendClient();
  if (!client) throw new Error('El envío de correos todavía no está configurado.');

  const from = process.env.RESEND_FROM || 'Endulcora <onboarding@resend.dev>';
  const fechaLegible = fecha
    ? new Date(`${fecha}T00:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';

  const { error } = await client.emails.send({
    from,
    to,
    subject: `¡Tu lugar está apartado! · ${taller} · Endulcora`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1B0720;">
        <p style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#7A2E7E;">Endulcora</p>
        <h1 style="font-size:20px;color:#4E1454;">Gracias por contestar, ${escapeHtml(nombre || '')}</h1>
        <p style="font-size:14px;line-height:1.6;">Recibimos tu inscripción con éxito. Aquí está el resumen de tu taller:</p>
        <table style="width:100%;border-collapse:collapse;margin-top:14px;font-size:14px;">
          <tr><td style="padding:6px 0;color:#9C9C9C;width:110px;">Taller</td><td style="padding:6px 0;font-weight:700;">${escapeHtml(taller || '')}</td></tr>
          ${fechaLegible ? `<tr><td style="padding:6px 0;color:#9C9C9C;">Fecha</td><td style="padding:6px 0;">${escapeHtml(fechaLegible)}</td></tr>` : ''}
          ${sede ? `<tr><td style="padding:6px 0;color:#9C9C9C;">Sede</td><td style="padding:6px 0;">${escapeHtml(sede)}</td></tr>` : ''}
          ${horario ? `<tr><td style="padding:6px 0;color:#9C9C9C;">Horario</td><td style="padding:6px 0;">${escapeHtml(horario)}</td></tr>` : ''}
        </table>
        <p style="margin-top:20px;font-size:13px;line-height:1.6;color:#1B0720;">Si tienes dudas o necesitas confirmar tu anticipo, escríbenos directo por WhatsApp.</p>
        <p style="margin-top:16px;"><a href="https://wa.me/52${numeroWhatsapp || ''}" style="background:#F5A623;color:#1B0720;padding:10px 22px;border-radius:999px;text-decoration:none;font-weight:700;font-size:13px;">Escribir por WhatsApp</a></p>
        <p style="margin-top:24px;font-size:12px;color:#9C9C9C;">Recibiste este correo porque te inscribiste a un taller en ${siteUrl ? siteUrl.replace(/^https?:\/\//, '') : 'endulcora.com'}.</p>
      </div>
    `,
  });
  if (error) throw new Error(error.message || 'Resend rechazó el correo.');
}

async function enviarCorreoConfirmacionClaseGratis({ to, nombre, horario, fecha, ubicacion, numeroWhatsapp, numeroWhatsappConfirmacion }) {
  const client = resendClient();
  if (!client) throw new Error('El envío de correos todavía no está configurado.');

  const from = process.env.RESEND_FROM || 'Endulcora <onboarding@resend.dev>';
  const fechaLegible = fecha
    ? new Date(`${fecha}T00:00:00`).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }).replace(',', '')
    : '';
  const diaDelMes = fecha ? new Date(`${fecha}T00:00:00`).getDate() : '';
  const whatsappUrl = `https://wa.me/52${numeroWhatsapp || ''}`;
  const mensajeConfirmacion = `Hola, quiero confirmar mi asistencia a la clase gratis de pan de muerto${horario ? ` del horario de ${horario}` : ''}.`;
  const whatsappConfirmacionUrl = `https://wa.me/52${numeroWhatsappConfirmacion || ''}?text=${encodeURIComponent(mensajeConfirmacion)}`;

  const { error } = await client.emails.send({
    from,
    to,
    subject: `Tu lugar en la clase gratis de pan de muerto${fechaLegible ? ` — ${fechaLegible}` : ''}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1B0720;">
        <p style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#7A2E7E;">Endulcora</p>
        <h1 style="font-size:20px;color:#4E1454;">Hola, ${escapeHtml(nombre || '')}:</h1>
        <p style="font-size:14px;line-height:1.6;">Quedaste registrado en la clase gratis de pan de muerto.</p>

        <table style="width:100%;border-collapse:collapse;margin-top:14px;font-size:14px;">
          ${fechaLegible ? `<tr><td style="padding:6px 6px 6px 0;width:24px;">📅</td><td style="padding:6px 0;">${escapeHtml(fechaLegible)}</td></tr>` : ''}
          ${horario ? `<tr><td style="padding:6px 6px 6px 0;">🕐</td><td style="padding:6px 0;">Horario: ${escapeHtml(horario)}</td></tr>` : ''}
          ${ubicacion ? `<tr><td style="padding:6px 6px 6px 0;vertical-align:top;">📍</td><td style="padding:6px 0;">${escapeHtml(ubicacion)}</td></tr>` : ''}
        </table>

        <div style="margin-top:20px;padding:18px;background:#4E1454;border-radius:14px;text-align:center;">
          <p style="margin:0;font-size:13px;font-weight:700;letter-spacing:.04em;color:#F5A623;">⚠️ FALTA UN PASO: CONFIRMA TU ASISTENCIA</p>
          <p style="margin:8px 0 0;font-size:13px;line-height:1.6;color:#FBF4E9;">Tu lugar <strong>no queda apartado</strong> hasta que confirmes por WhatsApp. Sin esta confirmación no podemos garantizarte el acceso a la clase.</p>
          <p style="margin:14px 0 0;"><a href="${whatsappConfirmacionUrl}" style="display:inline-block;background:#F5A623;color:#1B0720;padding:12px 26px;border-radius:999px;text-decoration:none;font-weight:700;font-size:13px;">Confirmar asistencia por WhatsApp</a></p>
        </div>

        <p style="margin-top:18px;font-size:13px;line-height:1.6;">Llega 10 minutos antes. El cupo por horario es limitado y el lugar se asigna por orden de llegada entre los registrados; si tu horario se llena, te pasamos al siguiente con lugar.</p>

        <h2 style="margin-top:22px;font-size:15px;color:#4E1454;">Qué vas a ver</h2>
        <p style="font-size:13px;line-height:1.6;">La receta del pan de muerto tradicional, paso a paso: masa, formado de canillas y bolita, barnizado y azucarado. Al final pruebas una muestra del pan recién hecho.</p>

        <div style="margin-top:22px;padding:16px;background:#FBF4E9;border-radius:12px;">
          <p style="margin:0;font-size:13px;font-weight:700;color:#4E1454;">💎 Si eres miembro de Club Endulcora</p>
          <p style="margin:8px 0 0;font-size:13px;line-height:1.6;">Tienes lugar VIP asegurado en tu horario y el recetario de pan de muerto incluido. La membresía cuesta $100 al mes y se paga por Mercado Pago. Para hacerte miembro escríbenos por WhatsApp.</p>
          <p style="margin:10px 0 0;"><a href="${whatsappUrl}" style="background:#F5A623;color:#1B0720;padding:9px 18px;border-radius:999px;text-decoration:none;font-weight:700;font-size:12px;">Hazme miembro</a></p>
        </div>

        <h2 style="margin-top:22px;font-size:15px;color:#4E1454;">¿Quieres hacerlo tú y llevarte tu pan?</h2>
        <p style="font-size:13px;line-height:1.6;">En el Taller de Pan de Muerto trabajas la masa con tus manos y te llevas 5 panes rellenos de 100 g cada uno, más el relleno. Es la diferencia con la clase gratis: en la clase pruebas una muestra; en el taller sales con medio kilo de pan hecho por ti.</p>
        <p style="margin-top:10px;"><a href="${whatsappUrl}" style="background:#4E1454;color:#FBF4E9;padding:9px 18px;border-radius:999px;text-decoration:none;font-weight:700;font-size:12px;">Aparta tu lugar</a></p>

        <p style="margin-top:26px;font-size:14px;">Nos vemos${diaDelMes ? ` el ${diaDelMes}` : ''}.<br><strong>Endulcora Estudio Gastronómico</strong></p>

        <p style="margin-top:20px;font-size:12px;color:#9C9C9C;">Si ya no puedes asistir, responde a este correo para liberar tu lugar.</p>
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
          <li>Lectura ilimitada de todos los eBooks</li>
        </ul>
        <p style="font-size:14px;line-height:1.6;">Por $100 MXN al mes. Cancela cuando quieras.</p>
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
        <p style="font-size:14px;line-height:1.6;">El recetario y el taller de este mes ya están disponibles solo para miembros. Por $100 MXN al mes tienes acceso a todo, y puedes cancelar cuando quieras.</p>
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
        <p style="font-size:14px;line-height:1.6;">Creaste tu cuenta en Endulcora, pero todavía no te has hecho miembro. Con la membresía tienes, cada mes, recetario, revista, taller online, acceso a toda la biblioteca de talleres grabados y lectura ilimitada de eBooks — por $100 MXN al mes, cancela cuando quieras.</p>
        <p style="margin-top:16px;"><a href="${siteUrl}/membresia" style="background:#F5A623;color:#1B0720;padding:10px 22px;border-radius:999px;text-decoration:none;font-weight:700;font-size:13px;">Hacerme miembro</a></p>
        <p style="margin-top:24px;font-size:12px;color:#9C9C9C;">Recibiste este correo porque tienes una cuenta en endulcora.com.</p>
      </div>
    `,
  });
  if (error) throw new Error(error.message || 'Resend rechazó el correo.');
}

module.exports = {
  enviarCorreoConfirmacionCompra,
  enviarCorreoConfirmacionInscripcionTaller,
  enviarCorreoConfirmacionClaseGratis,
  enviarCorreoRevistaMensual,
  enviarCorreoCampana,
  enviarCorreoLeadMagnetPaso0,
  enviarCorreoLeadMagnetPaso1,
  enviarCorreoLeadMagnetPaso2,
  enviarCorreoLeadMagnetPaso3,
  enviarCorreoRecordatorioMembresia,
};
