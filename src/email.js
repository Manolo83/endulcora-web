const { Resend } = require('resend');

function resendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
}

function formatoMonto(n) {
  return Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

async function enviarCorreoConfirmacionCompra({ to, order, siteUrl, numeroWhatsapp, linkEbooks }) {
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
        accion = `<p style="margin:4px 0 0;font-size:13px;color:#9C9C9C;">Estamos preparando este archivo y te lo mandamos en cuanto esté listo. Si lo necesitas ya, escríbenos por WhatsApp al ${numeroWhatsapp || ''}.</p>`;
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
        ${linkEbooks ? `<p style="margin:18px 0 6px;"><a href="${linkEbooks}" style="display:inline-block;background:#4E1454;color:#FBF4E9;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:700;font-size:14px;">Ver y descargar mis eBooks</a></p>
        <p style="margin:0;font-size:12.5px;line-height:1.5;color:#6b5a6e;">Funciona en celular, tablet y computadora. Si tu app de correo no descarga el archivo, en esa página puedes pedir que te lo mandemos como archivo adjunto o abrirlo en tu navegador. Guarda este correo: tus eBooks son tuyos para siempre.</p>` : ''}
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
    subject: `Recibimos tu inscripción · ${taller} · Endulcora`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1B0720;">
        <p style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#7A2E7E;">Endulcora</p>
        <h1 style="font-size:20px;color:#4E1454;">Gracias por contestar, ${escapeHtml(nombre || '')}</h1>
        <p style="font-size:14px;line-height:1.6;">Recibimos tu inscripción con éxito. Tu lugar todavía no está apartado — se confirma en cuanto se registra tu anticipo. Aquí está el resumen de tu taller:</p>
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

// Correo 9 del plan de ventas (tambien se usa para la vista previa en /admin).
function correoConfirmacionPagoTaller({
  nombre, taller, fecha, horario, sede, direccion, mapaLink, queAprendes,
  tipoPago, saldo, comunidadLink, numeroWhatsapp, arteUrl,
}) {
  const fechaLegible = fecha
    ? new Date(`${fecha}T00:00:00`).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })
    : '';
  const cuerpo = `
    <p>Hola${nombre ? ` ${escapeHtml(nombre)}` : ''}:</p>
    <p>Te esperamos${fechaLegible ? ` el <strong>${escapeHtml(fechaLegible)}${horario ? ` a las ${escapeHtml(horario)}` : ''}</strong>` : ''} en tu taller de <strong>${escapeHtml(taller || '')}</strong>.</p>
    ${sede || direccion ? `<p>📍 ${escapeHtml([sede, direccion].filter(Boolean).join(' · '))}${mapaLink ? ` · <a href="${escapeHtml(mapaLink)}" style="color:#7A2E7E;">Ver mapa</a>` : ''}</p>` : ''}
    ${tipoPago === 'anticipo' && saldo ? `<p>Recuerda que el resto (<strong>$${formatoMonto(saldo)}</strong>) se paga el día del taller.</p>` : ''}
    <p>Lleva mandil, cofia o paliacate y recipientes para llevarte lo que prepares.</p>
    ${queAprendes ? `<p style="font-size:14px;"><strong>Qué aprenderás:</strong> ${escapeHtml(queAprendes)}</p>` : ''}`;
  return {
    asunto: `Tu taller de ${taller || 'Endulcora'} está confirmado`,
    html: plantillaPlan({ arteUrl, cuerpo, pie: pieEndulcora({ numeroWhatsapp, comunidadLink }) }),
  };
}

async function enviarCorreoConfirmacionPagoTaller({ to, ...datos }) {
  const { asunto, html } = correoConfirmacionPagoTaller(datos);
  await enviarCorreoHtml({ to, asunto, html });
}

// Correo que sale en paralelo al pago instantaneo: se manda apenas alguien
// llena el formulario de /talleres/<slug>, tenga o no termine de pagar ahi
// mismo. Lleva el mismo link de Mercado Pago que ya se le mostro en
// pantalla, para que pueda retomarlo desde su correo si no pago al toque.
// PERSUASIVO CON COSAS CIERTAS, NO CON TRUCOS (misma regla que
// enviarCorreoRecuperacionTaller): el cupo solo se menciona si de verdad
// queda poco (cupoRestanteTaller), y el anticipo solo se ofrece como salida
// mas barata a quien de verdad eligio pagar completo.
async function enviarCorreoInfoYPagoTaller({
  to, nombre, taller, fecha, horario, sede, direccion, mapaLink, queAprendes,
  tipoPago, monto, saldo, lugares, link, numeroWhatsapp, comunidadLink, arteUrl,
}) {
  const fechaLegible = fecha
    ? new Date(`${fecha}T00:00:00`).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })
    : '';
  const cuerpo = `
    <p>Hola${nombre ? ` ${escapeHtml(nombre)}` : ''}:</p>
    <p>Vimos que te interesó el taller de <strong>${escapeHtml(taller || '')}</strong>. Aquí tienes todo lo que necesitas para decidir y apartar tu lugar.</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;background:#FBF4E9;border-radius:14px;">
      <tr><td style="padding:16px 18px;">
        <p style="margin:0;font-size:15px;font-weight:700;color:#4E1454;">${escapeHtml(taller || '')}</p>
        ${fechaLegible ? `<p style="margin:6px 0 0;font-size:14px;color:#1B0720;text-transform:capitalize;">${escapeHtml(fechaLegible)}</p>` : ''}
        ${horario ? `<p style="margin:2px 0 0;font-size:14px;color:#1B0720;">${escapeHtml(horario)}</p>` : ''}
        ${sede || direccion ? `<p style="margin:2px 0 0;font-size:14px;color:#1B0720;">${escapeHtml([sede, direccion].filter(Boolean).join(' · '))}${mapaLink ? ` · <a href="${escapeHtml(mapaLink)}" style="color:#7A2E7E;">Ver mapa</a>` : ''}</p>` : ''}
      </td></tr>
    </table>
    ${queAprendes ? `<p style="font-size:14px;line-height:1.6;"><strong>Qué aprenderás:</strong> ${escapeHtml(queAprendes)}</p>` : ''}
    ${lugares ? `<p style="font-size:14px;line-height:1.6;">De este taller quedan <strong>${lugares} ${lugares === 1 ? 'lugar' : 'lugares'}</strong> — el cupo se ocupa por orden de pago, no de registro.</p>` : ''}
    <p style="font-size:14px;line-height:1.6;">${tipoPago === 'anticipo'
      ? `Tu lugar se aparta con <strong>$${formatoMonto(monto)} de anticipo</strong>${saldo ? `; el resto ($${formatoMonto(saldo)}) se paga el día del taller.` : '.'}`
      : `Apartas tu lugar pagando el <strong>total de $${formatoMonto(monto)}</strong>.`}</p>`;
  const boton = link ? botonPlan(`Apartar mi lugar — $${formatoMonto(monto)}`, link, '#4E1454', '#FBF4E9') : '';
  // Boton de WhatsApp con el taller y la fecha ya escritos en el mensaje.
  // Quien llega a este correo ya dejo sus datos y eligio fecha, asi que la
  // conversacion empieza con todo el contexto; y es la persona quien escribe
  // primero, o sea que la ventana de 24 h la abre ella, no nosotros.
  const telWhats = String(numeroWhatsapp || '').replace(/\D/g, '').slice(-10);
  const mensajeWhats = encodeURIComponent(
    `Hola, me interesa el taller de ${taller || ''}${fechaLegible ? ` del ${fechaLegible.replace(',', '')}` : ''}${nombre ? `. Soy ${nombre}` : ''}.`,
  );
  const botonWhats = telWhats
    ? `<p style="margin:18px 0 0;font-size:13px;line-height:1.6;color:#6b5a6e;">¿Tienes una duda antes de apartar?</p>${
      botonPlan('Escribir por WhatsApp', `https://wa.me/521${telWhats}?text=${mensajeWhats}`, '#25D366', '#ffffff')}`
    : '';
  const salida = tipoPago === 'completo'
    ? '<p style="font-size:13px;line-height:1.6;color:#6b5a6e;">Si ahorita no te acomoda el pago completo, escríbenos y te ayudamos a cambiarlo por el anticipo.</p>'
    : '';
  return enviarCorreoHtml({
    to,
    asunto: `Tu lugar en ${taller || 'tu taller'} — toda la info + tu apartado`,
    html: plantillaPlan({
      arteUrl,
      cuerpo: `${cuerpo}${boton}${botonWhats}${salida}`,
      pie: pieEndulcora({ numeroWhatsapp, comunidadLink }),
    }),
  });
}

// Recetario del taller: se manda desde el portal de Lex en cuanto marca
// que esa persona asistio. "archivo" es la ruta publica del PDF que se
// subio para ese taller (ej. "/uploads/xxxx.pdf"); Resend lo descarga de
// ahi una sola vez y lo adjunta, no hace falta mandar el archivo completo.
async function enviarCorreoRecetarioTaller({ to, nombre, taller, siteUrl, archivo, archivoNombre }) {
  const client = resendClient();
  if (!client) throw new Error('El envío de correos todavía no está configurado.');

  const from = process.env.RESEND_FROM || 'Endulcora <onboarding@resend.dev>';

  const { error } = await client.emails.send({
    from,
    to,
    subject: `Tu recetario de "${taller}" · Endulcora`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1B0720;">
        <p style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#7A2E7E;">Endulcora</p>
        <h1 style="font-size:20px;color:#4E1454;">¡Gracias por venir, ${escapeHtml(nombre || '')}!</h1>
        <p style="font-size:14px;line-height:1.6;">Aquí está el recetario de <strong>${escapeHtml(taller || '')}</strong>, para que repitas la receta en casa.</p>
      </div>
    `,
    attachments: [{ filename: archivoNombre || 'Recetario.pdf', path: `${siteUrl}${archivo}` }],
  });
  if (error) throw new Error(error.message || 'Resend rechazó el correo.');
}

// eBook(s) que Lex vendio en persona (portal de Lex) -- mismos archivos
// que recibiria alguien que compra en linea (el eBook y, si los tiene
// cargados, su anexo y su app), adjuntos de una vez en un solo correo.
async function enviarCorreoEbooksTaller({ to, nombre, titulos, siteUrl, archivos }) {
  const client = resendClient();
  if (!client) throw new Error('El envío de correos todavía no está configurado.');

  const from = process.env.RESEND_FROM || 'Endulcora <onboarding@resend.dev>';

  const { error } = await client.emails.send({
    from,
    to,
    subject: `Tu${titulos.length > 1 ? 's' : ''} eBook${titulos.length > 1 ? 's' : ''} de Endulcora`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1B0720;">
        <p style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#7A2E7E;">Endulcora</p>
        <h1 style="font-size:20px;color:#4E1454;">¡Gracias, ${escapeHtml(nombre || '')}!</h1>
        <p style="font-size:14px;line-height:1.6;">Aquí está${titulos.length > 1 ? 'n' : ''} lo que compraste:</p>
        <ul style="font-size:14px;line-height:1.8;">${titulos.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}</ul>
      </div>
    `,
    attachments: archivos.map((a) => ({ filename: a.archivoNombre || 'archivo', path: `${siteUrl}${a.archivo}` })),
  });
  if (error) throw new Error(error.message || 'Resend rechazó el correo.');
}

// Recordatorio automatico de un taller ya pagado: diasFaltan es 2 (dos dias
// antes) o 0 (el mismo dia) — solo cambia el titulo y el tono de urgencia,
// el resto del contenido es igual.
async function enviarCorreoRecordatorioTaller({
  to, nombre, taller, fecha, horario, sede, direccion, mapaLink, queAprendes,
  tipoPago, saldo, diasFaltan, numeroWhatsapp, comunidadLink, arteUrl,
}) {
  const client = resendClient();
  if (!client) throw new Error('El envío de correos todavía no está configurado.');

  const from = process.env.RESEND_FROM || 'Endulcora <onboarding@resend.dev>';
  const fechaLegible = fecha
    ? new Date(`${fecha}T00:00:00`).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : '';
  // Correo 10 del plan de ventas: un dia antes.
  const titulo = diasFaltan === 0 ? '¡Tu taller es hoy!' : diasFaltan === 1 ? 'Mañana cocinamos juntos' : `Tu taller es en ${diasFaltan} días`;
  const asunto = diasFaltan === 1 ? 'Mañana cocinamos juntos' : diasFaltan === 0 ? `¡Hoy es tu taller! · ${taller} · Endulcora` : `Faltan ${diasFaltan} días para tu taller · ${taller} · Endulcora`;

  const { error } = await client.emails.send({
    from,
    to,
    subject: asunto,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1B0720;">
        <p style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#7A2E7E;">Endulcora</p>
        ${arteUrl ? `<img src="${escapeHtml(arteUrl)}" alt="" width="432" style="display:block;width:100%;max-width:432px;height:auto;border-radius:16px;margin:0 0 16px;border:0;">` : ''}
        <h1 style="font-size:20px;color:#4E1454;">${escapeHtml(titulo)}, ${escapeHtml(nombre || '')}</h1>
        <p style="font-size:14px;line-height:1.6;">${diasFaltan === 1 ? `Mañana${horario ? ` a las <strong>${escapeHtml(horario)}</strong>` : ''} es tu taller de <strong>${escapeHtml(taller || '')}</strong>${sede ? ` en ${escapeHtml(sede)}` : ''}. Llega 10 minutos antes.` : 'Este es tu recordatorio para que no se te pase:'}</p>
        <table style="width:100%;border-collapse:collapse;margin-top:14px;font-size:14px;">
          <tr><td style="padding:6px 0;color:#9C9C9C;width:110px;">Taller</td><td style="padding:6px 0;font-weight:700;">${escapeHtml(taller || '')}</td></tr>
          ${fechaLegible ? `<tr><td style="padding:6px 0;color:#9C9C9C;">Fecha</td><td style="padding:6px 0;">${escapeHtml(fechaLegible)}</td></tr>` : ''}
          ${horario ? `<tr><td style="padding:6px 0;color:#9C9C9C;">Horario</td><td style="padding:6px 0;">${escapeHtml(horario)}</td></tr>` : ''}
          ${sede ? `<tr><td style="padding:6px 0;color:#9C9C9C;">Sede</td><td style="padding:6px 0;">${escapeHtml(sede)}</td></tr>` : ''}
          ${direccion ? `<tr><td style="padding:6px 0;color:#9C9C9C;">Dirección</td><td style="padding:6px 0;">${escapeHtml(direccion)}${mapaLink ? ` · <a href="${escapeHtml(mapaLink)}" style="color:#7A2E7E;">Ver mapa</a>` : ''}</td></tr>` : ''}
        </table>
        ${tipoPago === 'anticipo' && saldo ? `<p style="margin-top:18px;font-size:13px;line-height:1.6;color:#1B0720;">Recuerda que pagaste solo tu anticipo: el día del taller se paga el saldo de <strong>$${formatoMonto(saldo)} MXN</strong>.</p>` : ''}
        ${queAprendes ? `<p style="margin-top:14px;font-size:13px;line-height:1.6;color:#1B0720;"><strong>Qué aprenderás:</strong> ${escapeHtml(queAprendes)}</p>` : ''}
        <div style="margin-top:14px;font-size:13px;line-height:1.6;color:#1B0720;">
          <strong>Qué traer:</strong>
          <ul style="margin:6px 0 0;padding-left:18px;">
            <li>Mandil</li>
            <li>Dos trapos para limpieza</li>
            <li>Gorro, cofia, gorra o algo que te cubra el cabello</li>
            <li>Toppers para llevarte tu producto terminado</li>
            <li>Una cuchara para degustación</li>
          </ul>
        </div>
        ${pieEndulcora({ numeroWhatsapp, comunidadLink })}
      </div>
    `,
  });
  if (error) throw new Error(error.message || 'Resend rechazó el correo.');
}

// Aviso interno al equipo (no al cliente): se manda a EQUIPO_NOTIFICACIONES_EMAIL
// cada vez que se confirma un pago de taller, para que no tengan que estar
// revisando /admin para saber quien se inscribio.
async function enviarAvisoEquipoNuevoTaller({ to, nombre, whatsapp, correo, taller, fecha, horario, sede, tipoPago, montoPagado, saldo }) {
  const client = resendClient();
  if (!client) throw new Error('El envío de correos todavía no está configurado.');

  const from = process.env.RESEND_FROM || 'Endulcora <onboarding@resend.dev>';
  const fechaLegible = fecha
    ? new Date(`${fecha}T00:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';

  const { error } = await client.emails.send({
    from,
    to,
    subject: `Nueva inscripción pagada: ${taller} (${nombre})`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1B0720;">
        <p style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#7A2E7E;">Endulcora · Aviso interno</p>
        <h1 style="font-size:18px;color:#4E1454;">Alguien acaba de pagar un taller</h1>
        <table style="width:100%;border-collapse:collapse;margin-top:10px;font-size:14px;">
          <tr><td style="padding:4px 0;color:#9C9C9C;width:110px;">Nombre</td><td style="padding:4px 0;font-weight:700;">${escapeHtml(nombre || '')}</td></tr>
          <tr><td style="padding:4px 0;color:#9C9C9C;">WhatsApp</td><td style="padding:4px 0;">${escapeHtml(whatsapp || '')}</td></tr>
          <tr><td style="padding:4px 0;color:#9C9C9C;">Correo</td><td style="padding:4px 0;">${escapeHtml(correo || '')}</td></tr>
          <tr><td style="padding:4px 0;color:#9C9C9C;">Taller</td><td style="padding:4px 0;">${escapeHtml(taller || '')}</td></tr>
          ${fechaLegible ? `<tr><td style="padding:4px 0;color:#9C9C9C;">Fecha</td><td style="padding:4px 0;">${escapeHtml(fechaLegible)}${horario ? ` · ${escapeHtml(horario)}` : ''}</td></tr>` : ''}
          ${sede ? `<tr><td style="padding:4px 0;color:#9C9C9C;">Sede</td><td style="padding:4px 0;">${escapeHtml(sede)}</td></tr>` : ''}
          <tr><td style="padding:4px 0;color:#9C9C9C;">Pagó</td><td style="padding:4px 0;">$${formatoMonto(montoPagado)} MXN (${tipoPago === 'anticipo' ? 'anticipo' : 'completo'})</td></tr>
          ${tipoPago === 'anticipo' && saldo ? `<tr><td style="padding:4px 0;color:#9C9C9C;">Saldo</td><td style="padding:4px 0;">$${formatoMonto(saldo)} MXN pendiente</td></tr>` : ''}
        </table>
        <p style="margin-top:20px;font-size:12px;color:#9C9C9C;">Este es un aviso automático, no hace falta contestarlo. El detalle completo está en /admin.</p>
      </div>
    `,
  });
  if (error) throw new Error(error.message || 'Resend rechazó el correo.');
}

// Link de "agregar a mi calendario" (Google Calendar) para un evento
// puntual como la clase gratis -- no necesita cuenta ni API, es una URL
// con los datos del evento. Quien agenda el evento en su calendario falta
// mucho menos que quien solo recibio un correo. CDMX es UTC-6 todo el
// año (sin horario de verano), por eso la resta es fija.
function linkAgregarCalendario({ titulo, fecha, horario, duracionHoras = 2, ubicacion }) {
  if (!fecha) return '';
  const m = String(horario || '').match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  let hora = m ? Number(m[1]) : 10;
  const minutos = m && m[2] ? Number(m[2]) : 0;
  if (m && m[3] && /pm/i.test(m[3]) && hora < 12) hora += 12;
  if (m && m[3] && /am/i.test(m[3]) && hora === 12) hora = 0;
  const inicio = new Date(`${fecha}T00:00:00-06:00`);
  inicio.setUTCHours(inicio.getUTCHours() + hora, minutos);
  const fin = new Date(inicio.getTime() + duracionHoras * 60 * 60 * 1000);
  const formato = (d) => `${d.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: titulo || 'Clase gratis Endulcora',
    dates: `${formato(inicio)}/${formato(fin)}`,
    location: ubicacion || '',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

async function enviarCorreoConfirmacionClaseGratis({ to, nombre, horario, fecha, ubicacion, numeroWhatsapp, linkWhatsappGrupo }) {
  const client = resendClient();
  if (!client) throw new Error('El envío de correos todavía no está configurado.');

  const from = process.env.RESEND_FROM || 'Endulcora <onboarding@resend.dev>';
  const fechaLegible = fecha
    ? new Date(`${fecha}T00:00:00`).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }).replace(',', '')
    : '';
  const diaDelMes = fecha ? new Date(`${fecha}T00:00:00`).getDate() : '';
  const whatsappUrl = `https://wa.me/52${numeroWhatsapp || ''}`;

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

        ${linkWhatsappGrupo ? `
        <div style="margin-top:20px;padding:18px;background:#4E1454;border-radius:14px;text-align:center;">
          <p style="margin:0;font-size:13px;font-weight:700;letter-spacing:.04em;color:#F5A623;">📲 ÚNETE AL GRUPO DE WHATSAPP DE LA CLASE</p>
          <p style="margin:8px 0 0;font-size:13px;line-height:1.6;color:#FBF4E9;">Únete para recibir actualizaciones de la clase y para confirmar tu asistencia.</p>
          <p style="margin:14px 0 0;"><a href="${linkWhatsappGrupo}" style="display:inline-block;background:#F5A623;color:#1B0720;padding:12px 26px;border-radius:999px;text-decoration:none;font-weight:700;font-size:13px;">Unirme al grupo de WhatsApp</a></p>
        </div>` : ''}

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

// "¿Asistirás?" de la clase gratis: dos botones (Sí / No). El control de
// aforo real (tope por horario, numero de inscrito) vive en
// store.responderClaseGratis, que se ejecuta cuando la persona abre uno de
// los dos links -- este correo solo pregunta, por orden de llegada de quien
// contesta "Sí" primero.
async function enviarCorreoConfirmarClaseGratis({ to, nombre, horario, fecha, ubicacion, confirmLink, fechaLimiteLegible }) {
  const client = resendClient();
  if (!client) throw new Error('El envío de correos todavía no está configurado.');

  const from = process.env.RESEND_FROM || 'Endulcora <onboarding@resend.dev>';
  const fechaLegible = fecha
    ? new Date(`${fecha}T00:00:00`).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }).replace(',', '')
    : '';
  const linkSi = `${confirmLink}${confirmLink.includes('?') ? '&' : '?'}va=si`;
  const linkNo = `${confirmLink}${confirmLink.includes('?') ? '&' : '?'}va=no`;

  const { error } = await client.emails.send({
    from,
    to,
    subject: `¿Asistirás a la clase gratis de pan de muerto?${fechaLegible ? ` — ${fechaLegible}` : ''}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1B0720;">
        <p style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#7A2E7E;">Endulcora</p>
        <h1 style="font-size:20px;color:#4E1454;">Hola, ${escapeHtml(nombre || '')}:</h1>
        <p style="font-size:14px;line-height:1.6;">Ya casi es tu clase demo gratis de pan de muerto, y los lugares de cada horario son limitados.</p>
        <p style="font-size:14px;line-height:1.6;"><strong>Necesitamos que nos digas si vendrás</strong> — por horario hay solo 100 lugares, por orden de llegada de quien conteste primero.</p>

        <table style="width:100%;border-collapse:collapse;margin-top:14px;font-size:14px;">
          ${fechaLegible ? `<tr><td style="padding:6px 6px 6px 0;width:24px;">📅</td><td style="padding:6px 0;">${escapeHtml(fechaLegible)}</td></tr>` : ''}
          ${horario ? `<tr><td style="padding:6px 6px 6px 0;">🕐</td><td style="padding:6px 0;">Horario: ${escapeHtml(horario)}</td></tr>` : ''}
          <tr><td style="padding:6px 6px 6px 0;">⏳</td><td style="padding:6px 0;">Duración: 2 horas</td></tr>
          ${ubicacion ? `<tr><td style="padding:6px 6px 6px 0;vertical-align:top;">📍</td><td style="padding:6px 0;">${escapeHtml(ubicacion)}</td></tr>` : ''}
        </table>

        <p style="margin-top:22px;margin-bottom:10px;text-align:center;font-weight:700;font-size:14px;">¿Asistirás?</p>
        <table style="width:100%;border-collapse:collapse;"><tr>
          <td style="width:50%;padding-right:6px;"><a href="${linkSi}" style="display:block;text-align:center;background:#1E7A46;color:#ffffff;padding:14px 0;border-radius:999px;text-decoration:none;font-weight:700;font-size:13px;">SÍ, VOY</a></td>
          <td style="width:50%;padding-left:6px;"><a href="${linkNo}" style="display:block;text-align:center;background:transparent;color:#4E1454;border:2px solid #4E1454;padding:12px 0;border-radius:999px;text-decoration:none;font-weight:700;font-size:13px;">NO PUEDO</a></td>
        </tr></table>

        ${fechaLimiteLegible ? `<p style="margin-top:18px;font-size:13px;line-height:1.6;text-align:center;color:#7A2E7E;"><strong>Contesta antes del ${escapeHtml(fechaLimiteLegible)}</strong> para asegurar tu lugar.</p>` : ''}

        <div style="margin-top:26px;border-radius:14px;background:#FBF4E9;padding:16px 18px;">
          <p style="margin:0 0 8px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#7A2E7E;font-weight:700;">Qué incluye esta clase demo</p>
          <ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.7;color:#1B0720;">
            <li>La clase y una degustación de pan de muerto de 30 g.</li>
            <li>Tu recetario, si vienes a la clase.</li>
            <li>Ese día también podrás comprar nuestros eBooks y aprovechar promociones especiales para talleres.</li>
            <li>Recuerda: la membresía Endulcora incluye la grabación de las clases, por si no puedes verla en vivo.</li>
          </ul>
        </div>

        <div style="margin-top:14px;border-radius:14px;background:#FBF4E9;padding:16px 18px;">
          <p style="margin:0 0 8px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#7A2E7E;font-weight:700;">Antes de venir</p>
          <ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.7;color:#1B0720;">
            <li>No contamos con espacio de estacionamiento.</li>
            <li>La admisión es solo para personas con registro — no se puede traer acompañantes.</li>
            <li>Endulcora no se hace responsable por pérdida o extravío de objetos personales.</li>
          </ul>
        </div>

        <p style="margin-top:26px;font-size:12px;color:#9C9C9C;">Si contestas "Sí" y alcanzas lugar, te llega tu ficha con tu número de inscrito — muéstrala al llegar, es tu pase de entrada.</p>
      </div>
    `,
  });
  if (error) throw new Error(error.message || 'Resend rechazó el correo.');
}

// Recordatorio solo para quien ya confirmo su lugar de verdad (no para
// todos los que se registraron) -- mismo criterio que ya usan los
// recordatorios de talleres pagados: a 2 dias y el mismo dia.
async function enviarCorreoRecordatorioClaseGratis({ to, nombre, horario, fecha, ubicacion, diasFaltan, numeroWhatsapp, tituloClase, numeroFicha }) {
  const client = resendClient();
  if (!client) throw new Error('El envío de correos todavía no está configurado.');

  const from = process.env.RESEND_FROM || 'Endulcora <onboarding@resend.dev>';
  const fechaLegible = fecha
    ? new Date(`${fecha}T00:00:00`).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }).replace(',', '')
    : '';
  const nombreClase = tituloClase || 'tu clase';
  const titulo = diasFaltan === 0 ? `¡${nombreClase} es hoy!` : `${nombreClase} es en 2 días`;
  const whatsappUrl = `https://wa.me/52${numeroWhatsapp || ''}`;

  const { error } = await client.emails.send({
    from,
    to,
    subject: diasFaltan === 0 ? `¡Hoy es ${nombreClase}!` : `Faltan 2 días para ${nombreClase}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1B0720;">
        <p style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#7A2E7E;">Endulcora</p>
        ${arteUrl ? `<img src="${escapeHtml(arteUrl)}" alt="" width="432" style="display:block;width:100%;max-width:432px;height:auto;border-radius:16px;margin:0 0 16px;border:0;">` : ''}
        <h1 style="font-size:20px;color:#4E1454;">${escapeHtml(titulo)}, ${escapeHtml(nombre || '')}</h1>
        <p style="font-size:14px;line-height:1.6;">${diasFaltan === 1 ? `Mañana${horario ? ` a las <strong>${escapeHtml(horario)}</strong>` : ''} es tu taller de <strong>${escapeHtml(taller || '')}</strong>${sede ? ` en ${escapeHtml(sede)}` : ''}. Llega 10 minutos antes.` : 'Este es tu recordatorio para que no se te pase:'}</p>
        <table style="width:100%;border-collapse:collapse;margin-top:14px;font-size:14px;">
          ${fechaLegible ? `<tr><td style="padding:6px 6px 6px 0;width:24px;">📅</td><td style="padding:6px 0;">${escapeHtml(fechaLegible)}</td></tr>` : ''}
          ${horario ? `<tr><td style="padding:6px 6px 6px 0;">🕐</td><td style="padding:6px 0;">Horario: ${escapeHtml(horario)}</td></tr>` : ''}
          ${ubicacion ? `<tr><td style="padding:6px 6px 6px 0;vertical-align:top;">📍</td><td style="padding:6px 0;">${escapeHtml(ubicacion)}</td></tr>` : ''}
        </table>
        ${numeroFicha ? `<p style="margin-top:16px;font-size:14px;line-height:1.6;">Tu ficha es la <strong>N.º ${escapeHtml(String(numeroFicha))}</strong>. Muéstrala al llegar: es tu pase de entrada y de coffee break.</p><p style="font-size:13px;line-height:1.6;">${AVISO_DESCUENTOS_MASTER_CLASS}</p>` : ''}
        <p style="margin-top:20px;font-size:13px;line-height:1.6;">Si ya no puedes venir, avísanos por WhatsApp para liberar tu lugar.</p>
        <p style="margin-top:12px;"><a href="${whatsappUrl}" style="background:#4E1454;color:#FBF4E9;padding:9px 18px;border-radius:999px;text-decoration:none;font-weight:700;font-size:12px;">Avisar por WhatsApp</a></p>
      </div>
    `,
  });
  if (error) throw new Error(error.message || 'Resend rechazó el correo.');
}

// ---- Plantilla de los correos del plan de ventas ----
// Todos terminan con el mismo pie (WhatsApp y Comunidad de avisos) y pueden
// llevar arriba el arte cuadrado de la masterclass o del taller.
function pieEndulcora({ numeroWhatsapp, comunidadLink } = {}) {
  const tel = String(numeroWhatsapp || '').replace(/\D/g, '').slice(-10);
  const lineas = [];
  if (tel) lineas.push(`¿Dudas? Escríbenos por WhatsApp: <a href="https://wa.me/521${tel}" style="color:#7A2E7E;">https://wa.me/521${tel}</a>`);
  if (comunidadLink) lineas.push(`Únete a la Comunidad Endulcora para enterarte de cambios y novedades: <a href="${escapeHtml(comunidadLink)}" style="color:#7A2E7E;">${escapeHtml(comunidadLink)}</a>`);
  if (!lineas.length) return '';
  return `<div style="margin-top:26px;border-top:1px solid #efe4ec;padding-top:14px;font-size:12px;line-height:1.6;color:#6b5a6e;">${lineas.map((l) => `<p style="margin:0 0 6px;">${l}</p>`).join('')}</div>`;
}

function datosPie(contenido = {}) {
  return { numeroWhatsapp: contenido.whatsapp_numero, comunidadLink: contenido.comunidad_avisos_link };
}

function botonPlan(texto, url, fondo = '#F5A623', color = '#1B0720') {
  return `<p style="margin:18px 0 4px;"><a href="${url}" style="display:inline-block;background:${fondo};color:${color};padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:700;font-size:14px;">${texto}</a></p>`;
}

// arteUrl: imagen cuadrada (URL completa). cuerpo: HTML ya armado.
function plantillaPlan({ arteUrl, cuerpo, pie, preheader }) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#ffffff;">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>` : ''}
<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1B0720;">
  <p style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#7A2E7E;margin:0 0 14px;">Endulcora</p>
  ${arteUrl ? `<img src="${escapeHtml(arteUrl)}" alt="" width="472" style="display:block;width:100%;max-width:472px;height:auto;border-radius:16px;margin:0 0 18px;border:0;">` : ''}
  <div style="font-size:15px;line-height:1.6;">${cuerpo}</div>
  ${pie || ''}
</div></body></html>`;
}

async function enviarCorreoHtml({ to, asunto, html, attachments, headers }) {
  const client = resendClient();
  if (!client) throw new Error('El envío de correos todavía no está configurado.');
  const from = process.env.RESEND_FROM || 'Endulcora <onboarding@resend.dev>';
  const { error } = await client.emails.send({
    from,
    to,
    subject: asunto,
    html,
    ...(attachments ? { attachments } : {}),
    ...(headers ? { headers } : {}),
  });
  if (error) throw new Error(error.message || 'Resend rechazó el correo.');
}

// Recordatorio de "hoy es tu clase en vivo gratis" para quien se registró en
// /clases-en-vivo o /endulcora-en-vivo (registrosVideoEnVivo) -- a mano
// desde /admin, no corre solo (a diferencia del embudo de la masterclass en
// src/correosMasterclass.js, que es un evento distinto con su propio
// registro/cobro).
function correoRecordatorioVideoEnVivo({ nombre, titulo, descripcion, hora, link, arteUrl, pie }) {
  const tituloLimpio = String(titulo || 'tu clase en vivo').replace(/\n/g, ' ').trim();
  const cuerpo = `<p>Hola${nombre ? ` ${escapeHtml(nombre)}` : ''}:</p>
    <p>Hoy es tu clase en vivo gratis: <strong>${escapeHtml(tituloLimpio)}</strong>${hora ? `, a las <strong>${escapeHtml(hora)}</strong>` : ''}.</p>
    ${descripcion ? `<p style="font-size:14px;color:#4b3f4e;">${escapeHtml(descripcion)}</p>` : ''}
    ${botonPlan('Entrar a la clase', link)}
    <p style="font-size:13px;color:#6b5a6e;">Se transmite en vivo por esta misma página — entra desde ahí a la hora de la clase.</p>`;
  return {
    asunto: `Hoy es tu clase en vivo: ${tituloLimpio}`,
    html: plantillaPlan({ arteUrl, cuerpo, pie, preheader: hora ? `Hoy a las ${hora}` : 'Hoy' }),
  };
}

async function enviarCorreoRecordatorioVideoEnVivo(datos) {
  const { asunto, html } = correoRecordatorioVideoEnVivo(datos);
  await enviarCorreoHtml({ to: datos.to, asunto, html });
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Correo de campaña masiva (a la lista de contactos importada en /admin).
// Incluye los headers List-Unsubscribe / List-Unsubscribe-Post (RFC 8058):
// Gmail y Yahoo exigen esto para no marcar como spam a quien manda correo en
// volumen, y con eso el "darse de baja" es de un clic, sin que el cliente de
// correo tenga que abrir el link.
async function enviarCorreoCampana({ to, nombre, asunto, cuerpoHtml, unsubscribeUrl, imagenes, archivos, videoUrl, botonTexto }) {
  const client = resendClient();
  if (!client) throw new Error('El envío de correos todavía no está configurado.');

  const from = process.env.RESEND_FROM || 'Endulcora <onboarding@resend.dev>';

  const imagenesHtml = (imagenes || [])
    .map((url) => `<img src="${url}" alt="" style="display:block;width:100%;max-width:480px;border-radius:14px;margin-bottom:14px;">`)
    .join('');
  // El texto del boton es "Ver video" por defecto (como siempre fue), pero
  // se puede cambiar si el link no es un video de verdad (ej. la pagina de
  // compra de un taller) -- ver botonTexto en /admin > Campañas.
  const videoHtml = videoUrl
    ? `<p style="margin-top:22px;"><a href="${videoUrl}" style="background:#F5A623;color:#1B0720;padding:10px 22px;border-radius:999px;text-decoration:none;font-weight:700;font-size:13px;display:inline-block;">${escapeHtml(botonTexto || '▶ Ver video')}</a></p>`
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

// ---- Acceso anticipado de la master class (ver src/accesoAnticipado.js) ----
// Los precios de los talleres nunca se ponen en estos correos: solo que hay
// descuentos exclusivos y que cada quien debe mostrar su correo o su ficha.
const AVISO_DESCUENTOS_MASTER_CLASS = 'Durante la master class habrá <strong>descuentos exclusivos para asistentes</strong> en nuestros talleres. La inscripción se hace en la sucursal. <strong>Para hacer válido el descuento, es responsabilidad de cada participante mostrar este correo o su ficha</strong> al inscribirse. Aplica para un solo taller por persona.';

function fechaClaseLegible(fecha) {
  return fecha
    ? new Date(`${fecha}T00:00:00`).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }).replace(',', '')
    : '';
}

function datosClaseHtml({ fecha, horario, ubicacion }) {
  const fechaLegible = fechaClaseLegible(fecha);
  return `
    <table style="width:100%;border-collapse:collapse;margin-top:6px;font-size:14px;">
      ${fechaLegible ? `<tr><td style="padding:5px 6px 5px 0;width:24px;">📅</td><td style="padding:5px 0;">${escapeHtml(fechaLegible)}</td></tr>` : ''}
      ${horario ? `<tr><td style="padding:5px 6px 5px 0;">🕐</td><td style="padding:5px 0;">Horario: ${escapeHtml(horario)}</td></tr>` : ''}
      ${ubicacion ? `<tr><td style="padding:5px 6px 5px 0;vertical-align:top;">📍</td><td style="padding:5px 0;">${escapeHtml(ubicacion)}</td></tr>` : ''}
    </table>`;
}

// Sustituye al "¿Asistirás?": ya no hay ficha gratis. El correo no dice
// cuantas fichas quedan (cambia despues de enviarlo); eso lo muestra la
// pagina del link personal.
async function enviarCorreoAccesoAnticipado({ to, nombre, titulo, fecha, horario, ubicacion, link, precio, cupo, cierreLegible }) {
  const client = resendClient();
  if (!client) throw new Error('El envío de correos todavía no está configurado.');
  const from = process.env.RESEND_FROM || 'Endulcora <onboarding@resend.dev>';
  const precioTexto = `$${formatoMonto(precio)}`;
  const { error } = await client.emails.send({
    from,
    to,
    subject: `Aparta tu ficha para ${titulo || 'la master class'}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:24px;color:#1B0720;">
        <p style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#7A2E7E;">Endulcora</p>
        <h1 style="font-size:20px;color:#4E1454;">Hola, ${escapeHtml(nombre || '')}:</h1>
        <p style="font-size:14px;line-height:1.6;">Ya casi es ${escapeHtml(titulo || 'la master class')} y los lugares presenciales son solo ${escapeHtml(String(cupo))} por horario. Abrimos el <strong>acceso anticipado</strong> para quienes se registraron.</p>
        ${datosClaseHtml({ fecha, horario, ubicacion })}

        <div style="margin-top:18px;border-radius:14px;background:#4E1454;color:#FBF4E9;padding:16px 18px;">
          <p style="margin:0 0 4px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#F5A623;font-weight:700;">Mientras haya fichas</p>
          <p style="margin:0 0 8px;font-size:16px;font-weight:700;">Acceso anticipado presencial · ${precioTexto}</p>
          <ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.7;">
            <li>Ficha de asistencia asegurada</li>
            <li>Coffee break: café, un aperitivo y degustación del producto de la clase</li>
            <li>Recetario de la master class, en PDF a tu correo</li>
            <li>1 mes de membresía Endulcora</li>
            <li>Descuentos exclusivos para asistentes</li>
          </ul>
        </div>
        <div style="margin-top:12px;border-radius:14px;background:#FBF4E9;padding:16px 18px;">
          <p style="margin:0 0 6px;font-size:15px;font-weight:700;color:#4E1454;">Si ya no alcanzas ficha · ${precioTexto}</p>
          <p style="margin:0;font-size:13px;line-height:1.6;">Recetario en PDF a tu correo, 1 mes de membresía y descuentos exclusivos para asistentes. Ves la clase en vivo desde tu casa.</p>
        </div>

        <p style="margin-top:22px;text-align:center;"><a href="${link}" style="display:inline-block;background:#F5A623;color:#1B0720;padding:14px 26px;border-radius:999px;text-decoration:none;font-weight:700;font-size:13px;letter-spacing:.04em;">VER FICHAS DISPONIBLES</a></p>
        <p style="margin-top:8px;font-size:12px;line-height:1.5;text-align:center;color:#7a6a7e;">Las fichas se asignan por orden de pago. El botón te muestra cuántas quedan en este momento.${cierreLegible ? ` El acceso anticipado cierra el ${escapeHtml(cierreLegible)}.` : ''}</p>

        <div style="margin-top:18px;border-radius:14px;background:#fff4df;border:1px solid #f5c66b;padding:14px 16px;">
          <p style="margin:0 0 6px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#7A2E7E;font-weight:700;">Promociones durante la master class</p>
          <p style="margin:0;font-size:13px;line-height:1.6;">${AVISO_DESCUENTOS_MASTER_CLASS}</p>
        </div>

        <div style="margin-top:14px;border-radius:14px;background:#FBF4E9;padding:14px 16px;">
          <p style="margin:0 0 6px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#7A2E7E;font-weight:700;">Antes de venir</p>
          <ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.7;">
            <li>No contamos con espacio de estacionamiento.</li>
            <li>La admisión es solo con ficha — no se puede traer acompañantes.</li>
            <li>Endulcora no se hace responsable por pérdida o extravío de objetos personales.</li>
          </ul>
        </div>
        <p style="margin-top:22px;font-size:12px;color:#9C9C9C;">Recibiste este correo porque te registraste a la master class en endulcora.com. La membresía incluida es de un mes; renovarla es tu decisión.</p>
      </div>
    `,
  });
  if (error) throw new Error(error.message || 'Resend rechazó el correo.');
}

// Confirmacion de pago del acceso anticipado: su ficha (o su acceso en
// linea), el recetario adjunto y lo que incluye.
async function enviarCorreoAccesoConfirmado({ to, nombre, titulo, fecha, horario, ubicacion, tipo, numero, pasoAOnline, fueraDeZona, membresiaHasta, yaEraMiembro, recetarioUrl, recetarioNombre, siteUrl, link, arteUrl, numeroWhatsapp, comunidadLink }) {
  const client = resendClient();
  if (!client) throw new Error('El envío de correos todavía no está configurado.');
  const from = process.env.RESEND_FROM || 'Endulcora <onboarding@resend.dev>';
  const presencial = tipo === 'presencial';
  const membresiaTexto = yaEraMiembro
    ? 'Tu membresía Endulcora sigue activa como hasta ahora.'
    : membresiaHasta
      ? `Tu membresía Endulcora está activa hasta el ${new Date(membresiaHasta).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', timeZone: 'America/Mexico_City' })}. Es de un mes: renovarla es tu decisión y puedes domiciliarla desde tu cuenta.`
      : 'Tu mes de membresía se activa en tu cuenta de endulcora.com con este mismo correo.';
  const attachments = recetarioUrl
    ? [{ filename: recetarioNombre || 'Recetario.pdf', path: `${siteUrl}${recetarioUrl}` }]
    : undefined;
  const { error } = await client.emails.send({
    from,
    to,
    subject: presencial ? 'Listo: tu lugar está asegurado' : 'Listo: tu acceso en línea está asegurado',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:24px;color:#1B0720;">
        <p style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#7A2E7E;">Endulcora</p>
        ${arteUrl ? `<img src="${escapeHtml(arteUrl)}" alt="" width="452" style="display:block;width:100%;max-width:452px;height:auto;border-radius:16px;margin:0 0 16px;border:0;">` : ''}
        <h1 style="font-size:20px;color:#4E1454;">¡Listo, ${escapeHtml(nombre || '')}!</h1>
        <p style="font-size:14px;line-height:1.6;">Tu acceso anticipado a <strong>${escapeHtml(titulo || 'la master class')}</strong> está pagado.</p>
        ${pasoAOnline ? '<p style="font-size:14px;line-height:1.6;background:#fde8e4;border-radius:10px;padding:10px 12px;">Mientras se confirmaba tu pago se ocuparon las últimas fichas presenciales, así que tu compra quedó como <strong>acceso en línea</strong>: recetario, mes de membresía y descuentos exclusivos.</p>' : ''}
        ${fueraDeZona ? '<p style="font-size:14px;line-height:1.6;background:#FBF4E9;border-radius:10px;padding:10px 12px;">La ficha presencial (lugar en sala y coffee break) es solo para quienes residen en CDMX, por la sede de la clase. Tu acceso incluye recetario, mes de membresía y descuentos exclusivos.</p>' : ''}
        ${presencial
          ? `<div style="margin-top:12px;border-radius:16px;background:#4E1454;color:#FBF4E9;padding:18px 20px;">
              <table style="width:100%;border-collapse:collapse;"><tr>
                <td style="vertical-align:middle;color:#FBF4E9;"><p style="margin:0;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#d9c7da;">Ficha de asistencia</p><p style="margin:4px 0 0;font-size:18px;font-weight:700;color:#FBF4E9;">${escapeHtml(nombre || '')}</p><p style="margin:2px 0 0;font-size:12px;color:#e3d3e4;">${escapeHtml(titulo || '')}</p></td>
                <td style="vertical-align:middle;text-align:right;color:#FBF4E9;"><p style="margin:0;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#d9c7da;">N.º</p><p style="margin:0;font-size:44px;font-weight:800;color:#F5A623;line-height:1;">${escapeHtml(String(numero))}</p></td>
              </tr></table>
            </div>
            <p style="font-size:14px;line-height:1.6;margin-top:12px;">Muestra esta ficha al llegar. Es tu pase de entrada y de coffee break.</p>`
          : `<p style="font-size:14px;line-height:1.6;">Tienes tu <strong>acceso en línea</strong>: ves la clase en vivo desde tu casa con tu membresía.</p>`}
        ${datosClaseHtml({ fecha, horario, ubicacion: presencial ? ubicacion : '' })}
        <div style="margin-top:16px;border-radius:14px;background:#FBF4E9;padding:14px 16px;">
          <p style="margin:0 0 6px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#7A2E7E;font-weight:700;">Esto es lo que tienes</p>
          <ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.7;">
            ${presencial ? '<li>Tu lugar con ficha de asistencia y coffee break el día de la clase.</li>' : ''}
            <li>${recetarioUrl ? 'Tu recetario digital: va adjunto en este correo.' : 'Tu recetario digital: te lo mandamos por correo en cuanto esté listo.'}</li>
            <li>La grabación, que te llega después de la clase.</li>
            <li><strong>Un mes gratis de Club Endulcora</strong>: recetario del mes, revista, taller en línea mensual, biblioteca de grabaciones y lectura de todos los ebooks. ${membresiaTexto}</li>
            <li>Descuentos exclusivos para asistentes.</li>
          </ul>
        </div>
        <div style="margin-top:12px;border-radius:14px;background:#fff4df;border:1px solid #f5c66b;padding:14px 16px;">
          <p style="margin:0;font-size:13px;line-height:1.6;">${AVISO_DESCUENTOS_MASTER_CLASS}</p>
        </div>
        <p style="margin-top:18px;"><a href="${siteUrl}/membresia" style="background:#F5A623;color:#1B0720;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:700;font-size:14px;">Entrar a mi membresía</a></p>
        <p style="margin-top:10px;font-size:13px;"><a href="${link}" style="color:#7A2E7E;">${presencial ? 'Ver mi ficha' : 'Ver mi acceso'}</a></p>
        ${pieEndulcora({ numeroWhatsapp, comunidadLink })}
      </div>
    `,
    attachments,
  });
  if (error) throw new Error(error.message || 'Resend rechazó el correo.');
}

// ---- Mes de membresia de regalo desde el live ----
function fechaLegible(iso) {
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', timeZone: 'America/Mexico_City' });
}

function plantillaRegalo({ nombre, titulo, parrafos, caja, botonTexto, siteUrl, letraChica, pie }) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1B0720;">
      <p style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#7A2E7E;">Endulcora</p>
      <h1 style="font-size:20px;color:#4E1454;">¡Hola${nombre ? ` ${escapeHtml(nombre)}` : ''}!</h1>
      ${titulo ? `<p style="font-size:15px;font-weight:700;color:#4E1454;">${titulo}</p>` : ''}
      ${parrafos.map((p) => `<p style="font-size:14px;line-height:1.6;">${p}</p>`).join('')}
      ${caja ? `<div style="background:#FBF4E9;border-radius:12px;padding:12px 14px;font-size:13px;line-height:1.6;margin-top:12px;">${caja}</div>` : ''}
      <p style="margin-top:18px;"><a href="${siteUrl}/membresia" style="background:#F5A623;color:#1B0720;padding:10px 22px;border-radius:999px;text-decoration:none;font-weight:700;font-size:13px;">${botonTexto}</a></p>
      ${letraChica ? `<p style="margin-top:16px;font-size:12px;color:#7a6a7e;line-height:1.5;">${letraChica}</p>` : ''}
      ${pie || ''}
      <p style="margin-top:24px;font-size:12px;color:#9C9C9C;">Recibiste este correo porque activaste tu mes de membresía en endulcora.com.</p>
    </div>
  `;
}

async function enviarCorreoRegaloActivado({ to, nombre, siteUrl, hasta }) {
  const client = resendClient();
  if (!client) throw new Error('El envío de correos todavía no está configurado.');
  const from = process.env.RESEND_FROM || 'Endulcora <onboarding@resend.dev>';
  const { error } = await client.emails.send({
    from,
    to,
    subject: 'Tu mes de regalo en Endulcora ya está activo',
    html: plantillaRegalo({
      nombre,
      siteUrl,
      titulo: 'Gracias por acompañarnos en el live.',
      parrafos: [
        'Tu recetario y todo el contenido de la membresía ya están en tu cuenta: recetario y revista del mes, taller online, biblioteca de clases grabadas y lectura ilimitada de eBooks.',
      ],
      caja: `<b>Tu mes de regalo termina el ${fechaLegible(hasta)}.</b> Ese día se hará tu primer cargo de $100 MXN con la tarjeta que registraste en Mercado Pago, y tu membresía seguirá activa mes a mes.`,
      botonTexto: 'Ir a mi membresía',
      letraChica: 'Te avisaremos 15, 3 y 1 días antes. Si no quieres continuar, cancela desde tu cuenta antes de esa fecha y no se hará ningún cargo.',
    }),
  });
  if (error) throw new Error(error.message || 'Resend rechazó el correo.');
}

// Recordatorio a los 15, 3 y 1 dias de que termine el regalo. Si cancelo
// durante el regalo, el mismo recordatorio la invita a volver a domiciliar
// su membresia antes de perder el acceso.
async function enviarCorreoRecordatorioRegalo({ to, nombre, siteUrl, dias, hasta, cancelada, origen, numeroWhatsapp, comunidadLink }) {
  const client = resendClient();
  if (!client) throw new Error('El envío de correos todavía no está configurado.');
  const from = process.env.RESEND_FROM || 'Endulcora <onboarding@resend.dev>';
  const cuando = dias === 1 ? 'mañana' : `en ${dias} días`;
  const fecha = fechaLegible(hasta);
  let subject;
  let parrafos;
  let caja;
  let botonTexto;
  let letraChica;
  if (origen === 'acceso_anticipado' && cancelada) {
    // Mes gratis con el acceso anticipado de la masterclass (pago unico) que
    // TODAVIA no domicilio su tarjeta: correo 8 del plan de ventas, le
    // ofrece domiciliar. Si ya domicilio, cae en el bloque de abajo (se
    // renueva sola) sin importar que haya empezado como acceso anticipado.
    subject = dias === 1 ? 'Tu mes gratis en Club Endulcora termina mañana' : `Tu mes gratis en Club Endulcora termina ${cuando}`;
    parrafos = [
      `${dias === 1 ? 'Mañana' : `En ${dias} días`} termina tu mes gratis. Para seguir con tu recetario del mes, el taller en línea y todos los ebooks, quédate por <b>$100 al mes</b>, con cargo automático. Puedes cancelar cuando quieras.`,
    ];
    caja = `Si te quedas, tu primer cargo sería el ${fecha}, cuando termine tu mes gratis. No se te cobra nada antes.`;
    botonTexto = 'Seguir en Club Endulcora';
  } else if (cancelada) {
    subject = dias === 1 ? 'Mañana pierdes tu acceso a Endulcora' : `Tu acceso a Endulcora termina ${cuando}`;
    parrafos = [
      `Cancelaste tu membresía, así que tu acceso termina ${cuando}. Después ya no podrás descargar tu recetario ni ver el taller, la revista, la biblioteca de clases y los eBooks.`,
      'Si quieres seguir, vuelve a activar tu membresía domiciliada. No se te cobra nada antes de que termine tu mes de regalo.',
    ];
    caja = `<b>Te ${dias === 1 ? 'queda 1 día' : `quedan ${dias} días`}.</b> Si la reactivas, tu primer cargo de $100 MXN sería el ${fecha}.`;
    botonTexto = 'Reactivar mi membresía';
  } else {
    subject = dias === 1 ? 'Mañana se renueva tu membresía Endulcora' : `Tu mes de regalo en Endulcora termina ${cuando}`;
    parrafos = [
      dias >= 15
        ? 'Ya disfrutaste la mitad de tu mes de regalo. Todavía tienes el recetario del mes, la revista, el taller online y todos los eBooks.'
        : `Tu mes de regalo termina ${cuando}. Para no perder tu acceso no tienes que hacer nada: tu membresía se renueva sola con tu tarjeta domiciliada.`,
    ];
    caja = `<b>Te ${dias === 1 ? 'queda 1 día' : `quedan ${dias} días`}.</b> Primer cargo: $100 MXN el ${fecha}, con la tarjeta que registraste en Mercado Pago.`;
    botonTexto = 'Ver mi membresía';
    letraChica = 'Si no quieres continuar, cancela desde tu cuenta antes de esa fecha y no se hará ningún cargo.';
  }
  const { error } = await client.emails.send({
    from,
    to,
    subject,
    html: plantillaRegalo({ nombre, siteUrl, parrafos, caja, botonTexto, letraChica, pie: pieEndulcora({ numeroWhatsapp, comunidadLink }) }),
  });
  if (error) throw new Error(error.message || 'Resend rechazó el correo.');
}

// ---- Correo de la promocion "El Buen Fin llego antes" a la comunidad ----
// HTML con tablas y estilos en linea (lo que si respetan Gmail, Outlook y
// Apple Mail). htmlCorreoBuenFin se usa tambien para la vista previa del
// admin, asi lo que se ve ahi es exactamente lo que se manda.
function htmlCorreoBuenFin({ nombre, unsubscribeUrl, siteUrl, precioUno, precioPaquete, precioNormal, fin, ebooks, whatsapp, variante = 'lanzamiento', comprasComunidad = 0, elegidos = [] }) {
  const pesos = (n) => `$${formatoMonto(n)}`;
  const link = (extra = '') => `${siteUrl}/buen-fin?origen=correo${extra}`;
  const porLibro = precioPaquete / 4;
  const ahorro = precioNormal * 4 - precioPaquete;
  const finFecha = fin ? fin.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Mexico_City' }) : '';
  // finHora ("11:59 p.m.") a media frase; finHoraFin sin el punto final
  // cuando la frase termina justo despues (para no dejar "p.m..").
  const finHora = fin ? fin.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Mexico_City' }) : '';
  const finHoraFin = finHora.replace(/\.$/, '');
  const tel = String(whatsapp || '').replace(/\D/g, '');
  const telVisible = tel.replace(/(\d{2})(\d{4})(\d{4})/, '$1 $2 $3');
  const hola = `Hola${nombre ? ` ${escapeHtml(nombre)}` : ''}:`;
  const boton = (href, texto, fondo, color, tam = 14) =>
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 18px;"><tr><td align="center" style="background:${fondo};border-radius:999px;"><a href="${href}" style="display:block;padding:15px 12px;font-family:Arial,sans-serif;font-size:${tam}px;font-weight:700;letter-spacing:.04em;color:${color};text-decoration:none;text-transform:uppercase;">${texto}</a></td></tr></table>`;
  const urlImagen = (e) => (e.imagen ? (/^https?:\/\//.test(e.imagen) ? e.imagen : `${siteUrl}${e.imagen}`) : '');
  const portada = (e) => {
    const img = urlImagen(e);
    return `<td width="50%" valign="top" style="padding:5px;">
      <a href="${link(`&eb=${e.id}`)}" style="display:block;text-decoration:none;color:#1B0720;background:#ffffff;border:1px solid #eadfe9;border-radius:12px;overflow:hidden;">
        ${img ? `<img src="${escapeHtml(img)}" alt="${escapeHtml(e.titulo)}" width="250" style="display:block;width:100%;height:auto;border:0;">` : `<div style="background:#4E1454;color:#FBF4E9;padding:46px 10px;text-align:center;font-family:Arial,sans-serif;font-weight:700;font-size:15px;">${escapeHtml(e.titulo)}</div>`}
        <div style="padding:8px 10px 10px;font-family:Arial,sans-serif;">
          <div style="font-size:12px;font-weight:700;color:#4E1454;line-height:1.3;min-height:31px;">${escapeHtml(e.titulo)}</div>
          <div style="font-size:12px;margin-top:4px;"><s style="color:#8a7d8d;">${pesos(precioNormal)}</s> <b style="color:#C8312B;font-size:17px;">${pesos(precioUno)}</b></div>
          <div style="font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#4E1454;margin-top:3px;">Lo quiero →</div>
        </div>
      </a></td>`;
  };
  const filas = [];
  for (let i = 0; i < ebooks.length; i += 2) filas.push(`<tr>${portada(ebooks[i])}${ebooks[i + 1] ? portada(ebooks[i + 1]) : '<td width="50%"></td>'}</tr>`);
  const paso = (n, texto) => `<tr><td width="30" valign="top" style="padding:4px 0;"><div style="width:22px;height:22px;line-height:22px;border-radius:50%;background:#4E1454;color:#FBF4E9;text-align:center;font-size:12px;font-weight:700;">${n}</div></td><td style="padding:4px 0;font-size:14px;color:#1B0720;">${texto}</td></tr>`;
  const ofertas = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td width="50%" style="padding:0 5px 0 0;" valign="top"><div style="border:1px solid #eadfe9;border-radius:14px;padding:14px 8px;text-align:center;">
        <s style="font-size:12px;color:#8a7d8d;">Antes ${pesos(precioNormal)}</s>
        <div style="font-size:40px;font-weight:800;color:#C8312B;line-height:1.05;">${pesos(precioUno)}</div>
        <div style="font-size:16px;font-weight:700;color:#4E1454;">1 eBook</div></div></td>
      <td width="50%" style="padding:0 0 0 5px;" valign="top"><div style="border:2px solid #F5A623;background:#fff8ea;border-radius:14px;padding:13px 8px;text-align:center;">
        <s style="font-size:12px;color:#8a7d8d;">Antes ${pesos(precioNormal * 4)}</s>
        <div style="font-size:40px;font-weight:800;color:#C8312B;line-height:1.05;">${pesos(precioPaquete)}</div>
        <div style="font-size:16px;font-weight:700;color:#4E1454;">4 eBooks</div>
        <div style="font-size:12px;font-weight:700;color:#1f7a4d;">${pesos(porLibro)} c/u · ahorras ${pesos(ahorro)}</div></div></td>
    </tr></table>
    <div style="height:14px;"></div>`;
  const reloj = (titulo, detalle) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#1B0720;border-radius:14px;"><tr><td style="padding:14px 16px;text-align:center;">
      <div style="font-size:22px;font-weight:800;color:#F5A623;">${titulo}</div>
      <div style="font-size:13px;color:#e9dcea;margin-top:4px;">${detalle}</div>
    </td></tr></table>
    <div style="height:16px;"></div>`;
  const librosHtml = (titulo) => (ebooks.length ? `<p style="margin:4px 0 8px;text-align:center;font-size:19px;font-weight:800;color:#4E1454;">${titulo}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${filas.join('')}</table>
    <div style="height:8px;"></div>` : '');
  const pruebaSocial = comprasComunidad >= 5 ? `<div style="border:1px dashed #cdb8cf;border-radius:12px;padding:10px 12px;text-align:center;font-size:14px;margin:0 0 16px;">🔥 <b>${comprasComunidad} personas</b> de la comunidad ya se llevaron sus eBooks.</div>` : '';
  const whats = (texto) => (tel ? boton(`https://wa.me/52${tel}?text=${encodeURIComponent(texto)}`, `¿Dudas? WhatsApp ${telVisible}`, '#25D366', '#ffffff', 13) : '');
  const ps = (texto) => `<p style="margin:0 0 18px;font-size:14px;border-left:3px solid #F5A623;padding-left:12px;"><b>P.D.</b> ${texto}</p>`;

  let preheader;
  let hero;
  let cuerpo;
  if (variante === 'tres-dias') {
    preheader = `${nombre ? `${escapeHtml(nombre)}, el` : 'El'} ${finFecha.split(',')[0] || 'último día'} a medianoche tus eBooks regresan a ${pesos(precioNormal)}.`;
    hero = `<tr><td style="background:#1B0720;padding:30px 24px;text-align:center;">
      <div style="font-size:11px;letter-spacing:.26em;text-transform:uppercase;color:#F5A623;">Endulcora · Buen Fin</div>
      <div style="font-size:46px;line-height:1;font-weight:800;color:#F5A623;margin-top:10px;">QUEDAN 3 DÍAS</div>
      <div style="font-size:15px;color:#e9dcea;margin-top:10px;">El Buen Fin de Endulcora termina el ${finFecha} a las ${finHoraFin}.</div>
    </td></tr>`;
    cuerpo = `<p style="margin:0 0 12px;">${hola}</p>
    <p style="margin:0 0 16px;">Te escribimos porque todavía no aprovechas el Buen Fin. Quedan 3 días para llevarte <b>todos los eBooks a mitad de precio</b>. Después regresan a ${pesos(precioNormal)} cada uno.</p>
    ${pruebaSocial}${ofertas}
    ${boton(link(), 'Elegir mis eBooks →', '#F5A623', '#1B0720', 15)}
    ${librosHtml('Los más vendidos del Buen Fin')}
    ${boton(`${link()}#catalogo`, 'Ver todos los eBooks en promoción', '#4E1454', '#FBF4E9', 13)}
    ${reloj(`Termina el ${finFecha}`, `a las ${finHoraFin}. Después regresan a ${pesos(precioNormal)}.`)}
    ${ps(`Si eliges 2 o 3 eBooks, te conviene llevarte 4: pagas lo mismo o menos. Con 4 eBooks pagas ${pesos(porLibro)} por cada uno.`)}
    ${whats('Hola, tengo una duda sobre la promoción de eBooks del Buen Fin.')}`;
  } else if (variante === 'ultimo-dia') {
    preheader = `A las ${finHora} de hoy se acaban los eBooks a ${pesos(porLibro)}.`;
    hero = `<tr><td style="background:#C8312B;padding:30px 24px;text-align:center;">
      <div style="font-size:11px;letter-spacing:.26em;text-transform:uppercase;color:#ffffff;">Endulcora · Buen Fin</div>
      <div style="font-size:40px;line-height:1.02;font-weight:800;color:#ffffff;margin-top:10px;">HOY ES EL ÚLTIMO DÍA</div>
      <div style="font-size:15px;color:#ffe9e7;margin-top:10px;">A las ${finHora} de hoy los eBooks regresan a ${pesos(precioNormal)}.</div>
    </td></tr>`;
    cuerpo = `<p style="margin:0 0 12px;">${hola}</p>
    <p style="margin:0 0 18px;">Este es el último aviso: el Buen Fin de Endulcora <b>termina hoy a medianoche</b>. Si tenías algún eBook en mente, es el momento. Mañana ya no hay 4 por ${pesos(precioPaquete)}.</p>
    ${ofertas}
    ${boton(link(), 'Aprovechar antes de medianoche →', '#F5A623', '#1B0720', 15)}
    ${librosHtml('Los que más se llevaron')}
    ${ps('Pagas con tarjeta, OXXO o transferencia y te llegan al momento a tu correo, en PDF para siempre.')}
    ${whats('Hola, tengo una duda sobre la promoción de eBooks del Buen Fin.')}`;
  } else if (variante === 'carrito') {
    const n = elegidos.length;
    const faltan = n % 4 ? 4 - (n % 4) : 0;
    const paquetes = Math.floor(n / 4);
    const totalElegidos = paquetes * precioPaquete + (n % 4) * precioUno;
    const totalCompletando = (paquetes + (faltan ? 1 : 0)) * precioPaquete;
    const ids = elegidos.map((e) => e.id).join(',');
    const lista = elegidos.map((e) => {
      const img = urlImagen(e);
      return `<tr><td width="56" valign="middle" style="padding:6px 0;">${img ? `<img src="${escapeHtml(img)}" alt="" width="48" style="display:block;width:48px;height:auto;border-radius:6px;border:0;">` : '<div style="width:48px;height:64px;border-radius:6px;background:#4E1454;"></div>'}</td>
        <td valign="middle" style="padding:6px 0 6px 8px;font-size:14px;font-weight:700;color:#4E1454;">${escapeHtml(e.titulo)}</td></tr>`;
    }).join('');
    preheader = 'Elegiste tus eBooks pero el pago no se completó. La promoción sigue.';
    hero = `<tr><td style="background:#4E1454;padding:30px 24px;text-align:center;">
      <div style="font-size:11px;letter-spacing:.26em;text-transform:uppercase;color:#F5A623;">Endulcora · Buen Fin</div>
      <div style="font-size:34px;line-height:1.05;font-weight:800;color:#FBF4E9;margin-top:10px;">Tus eBooks te esperan</div>
      <div style="font-size:15px;color:#e9dcea;margin-top:10px;">Elegiste ${n === 1 ? 'tu eBook' : `tus ${n} eBooks`} pero el pago no se completó.</div>
    </td></tr>`;
    cuerpo = `<p style="margin:0 0 12px;">${hola}</p>
    <p style="margin:0 0 14px;">Vimos que elegiste ${n === 1 ? 'este eBook' : 'estos eBooks'} del Buen Fin y el pago se quedó a medias. Te los guardamos: con un clic regresas a la página con ${n === 1 ? 'él ya elegido' : 'todos ya elegidos'}.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FBF4E9;border-radius:14px;"><tr><td style="padding:10px 14px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${lista}</table>
      <div style="border-top:1px solid #eadfe9;margin-top:6px;padding-top:8px;font-size:15px;"><b>Total: ${pesos(totalElegidos)}</b></div>
    </td></tr></table>
    <div style="height:16px;"></div>
    ${boton(link(`&eb=${ids}`), 'Terminar mi compra →', '#F5A623', '#1B0720', 15)}
    ${faltan ? `<div style="border:2px solid #F5A623;background:#fff8ea;border-radius:14px;padding:12px 14px;font-size:14px;margin:0 0 16px;">💡 Agrega ${faltan === 1 ? '1 eBook más' : `${faltan} eBooks más`} y pagas ${pesos(totalCompletando)} por ${n + faltan}${totalCompletando <= totalElegidos ? ': lo mismo o menos de lo que ibas a pagar' : ''}.</div>` : ''}
    ${finFecha ? reloj(`La promoción termina el ${finFecha}`, `a las ${finHoraFin}. Después regresan a ${pesos(precioNormal)}.`) : ''}
    ${ps('Puedes pagar con tarjeta, OXXO o transferencia. Si tuviste algún problema al pagar, escríbenos y te ayudamos.')}
    ${tel ? boton(`https://wa.me/52${tel}?text=${encodeURIComponent('Hola, tuve un problema al pagar mis eBooks del Buen Fin.')}`, `¿Problemas al pagar? WhatsApp ${telVisible}`, '#25D366', '#ffffff', 13) : ''}`;
  } else {
    preheader = `Solo para quienes ya son parte de Endulcora: eBooks a ${pesos(precioUno)} o 4 por ${pesos(precioPaquete)}.`;
    hero = `<tr><td style="background:#4E1454;padding:30px 24px;text-align:center;">
    <div style="display:inline-block;background:#C8312B;color:#ffffff;font-size:10px;font-weight:700;letter-spacing:.16em;padding:4px 12px;border-radius:999px;">SOLO COMUNIDAD ENDULCORA</div>
    <div style="font-size:11px;letter-spacing:.26em;text-transform:uppercase;color:#F5A623;margin-top:14px;">Endulcora · eBooks</div>
    <div style="font-size:32px;line-height:1.05;font-weight:800;color:#FBF4E9;margin-top:8px;">¡El Buen Fin llegó a Endulcora!</div>
    <div style="font-size:15px;color:#e9dcea;margin-top:10px;">Todos nuestros eBooks a mitad de precio, y 4 por ${pesos(precioPaquete)}.</div>
  </td></tr>`;
    cuerpo = `<p style="margin:0 0 12px;">${hola}</p>
    <p style="margin:0 0 18px;">Gracias por ser parte de Endulcora. Te adelantamos el Buen Fin: <b>todos nuestros eBooks a mitad de precio</b>${finFecha ? `, solo hasta el ${finFecha}` : ''}.</p>
    ${ofertas}
    ${boton(link(), 'Elegir mis eBooks →', '#F5A623', '#1B0720', 15)}
    ${ebooks.length ? `${librosHtml('Los más vendidos')}${boton(`${link()}#catalogo`, 'Ver todos los eBooks en promoción', '#4E1454', '#FBF4E9', 13)}` : ''}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FBF4E9;border-radius:14px;"><tr><td style="padding:12px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${paso(1, 'Eliges tus eBooks en la página.')}
        ${paso(2, 'Pagas con Mercado Pago: tarjeta, OXXO o transferencia.')}
        ${paso(3, 'Te llegan <b>al momento</b> a tu correo, en PDF para siempre.')}
      </table></td></tr></table>
    <div style="height:16px;"></div>
    ${finFecha ? reloj(`Termina el ${finFecha}`, `a las ${finHoraFin}. Después los eBooks regresan a ${pesos(precioNormal)}.`) : ''}
    ${boton(link(), 'Aprovechar antes de que termine →', '#F5A623', '#1B0720', 14)}
    ${ps('Si eliges 2 o 3 eBooks, te conviene llevarte 4: pagas lo mismo o menos. La página te va diciendo cuánto te falta.')}
    ${whats('Hola, tengo una duda sobre la promoción de eBooks del Buen Fin.')}`;
  }

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>El Buen Fin en Endulcora</title></head>
<body style="margin:0;padding:0;background:#FBF4E9;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FBF4E9;"><tr><td align="center" style="padding:20px 10px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;font-family:Arial,sans-serif;color:#1B0720;">
  ${hero}
  <tr><td style="padding:24px 22px 6px;font-size:15px;line-height:1.6;">
    ${cuerpo}
  </td></tr>
  <tr><td style="padding:6px 24px 26px;text-align:center;font-size:11px;line-height:1.55;color:#8a7d8d;">
    Recibiste este correo porque estás en la comunidad de endulcora.com.<br><a href="${unsubscribeUrl}" style="color:#8a7d8d;">Dejar de recibir estos correos</a>
  </td></tr>
</table></td></tr></table></body></html>`;
}

async function enviarCorreoBuenFin({ to, asunto, ...datos }) {
  const client = resendClient();
  if (!client) throw new Error('El envío de correos todavía no está configurado.');
  const from = process.env.RESEND_FROM || 'Endulcora <onboarding@resend.dev>';
  const { error } = await client.emails.send({
    from,
    to,
    subject: asunto,
    html: htmlCorreoBuenFin(datos),
    headers: {
      'List-Unsubscribe': `<${datos.unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  });
  if (error) throw new Error(error.message || 'Resend rechazó el correo.');
}

// "Mandarmelo por correo" desde la pagina "Tus eBooks": el PDF como
// adjunto, que cualquier app de correo sabe abrir y guardar.
async function enviarCorreoAdjuntoEbook({ to, titulo, nombreArchivo, contenido, linkEbooks }) {
  const client = resendClient();
  if (!client) throw new Error('El envío de correos todavía no está configurado.');
  const from = process.env.RESEND_FROM || 'Endulcora <onboarding@resend.dev>';
  const { error } = await client.emails.send({
    from,
    to,
    subject: `Tu eBook: ${titulo} · Endulcora`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1B0720;">
        <p style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#7A2E7E;">Endulcora</p>
        <h1 style="font-size:20px;color:#4E1454;">Aquí está tu eBook</h1>
        <p style="font-size:14px;line-height:1.6;">Te mandamos <strong>${escapeHtml(titulo)}</strong> como archivo adjunto. Lo encuentras al final de este correo: tócalo para abrirlo y guárdalo en tu teléfono, tablet o computadora.</p>
        <p style="font-size:13px;line-height:1.6;color:#6b5a6e;">En iPhone o iPad: abre el PDF, toca Compartir y elige "Guardar en Archivos" o "Libros". En Android: abre el PDF y toca Descargar o Guardar.</p>
        ${linkEbooks ? `<p style="margin-top:16px;"><a href="${linkEbooks}" style="background:#F5A623;color:#1B0720;padding:10px 20px;border-radius:999px;text-decoration:none;font-weight:700;font-size:13px;">Ver todos mis eBooks</a></p>` : ''}
      </div>
    `,
    attachments: [{ filename: nombreArchivo, content: contenido }],
  });
  if (error) throw new Error(error.message || 'Resend rechazó el correo.');
}

// Aviso interno: se vendio algo cuyo archivo no esta en el servidor.
async function enviarAvisoEquipoArchivoFaltante({ to, order, faltan, siteUrl }) {
  const client = resendClient();
  if (!client) throw new Error('El envío de correos todavía no está configurado.');
  const from = process.env.RESEND_FROM || 'Endulcora <onboarding@resend.dev>';
  const { error } = await client.emails.send({
    from,
    to,
    subject: `⚠️ Falta el archivo de una venta (pedido ${order.id})`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1B0720;">
        <h1 style="font-size:18px;color:#B3261E;">Se vendió un archivo que no está en el sitio</h1>
        <p style="font-size:14px;line-height:1.6;">El pedido ${order.id} de <strong>${escapeHtml(order.email)}</strong> está pagado, pero no hay archivo para:</p>
        <ul style="font-size:14px;">${faltan.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}</ul>
        <p style="font-size:14px;line-height:1.6;">Súbelo en /admin › Productos y luego, en Ventas, toca "Reenviar correo" en ese pedido. Mientras tanto la clienta ve un aviso para pedirlo por WhatsApp.</p>
        <p><a href="${siteUrl}/admin#seccionVentas" style="background:#4E1454;color:#FBF4E9;padding:10px 20px;border-radius:999px;text-decoration:none;font-weight:700;font-size:13px;">Abrir Ventas</a></p>
      </div>
    `,
  });
  if (error) throw new Error(error.message || 'Resend rechazó el correo.');
}


// Pago de taller a medias: aparto lugar, llego a Mercado Pago y no termino.
// Lo manda src/recuperarPagosTaller.js, dos veces dentro de las 72 horas que
// de verdad se le guarda el lugar.
//
// Convence con cosas ciertas, no con trucos: su lugar existe y esta
// apartado, la fecha en que se libera es la real, el cupo que se menciona
// sale de la base y solo se menciona si de verdad queda poco, y la salida
// barata (pagar solo el anticipo) es una opcion que ya existe en el sitio.
// Nada de contadores falsos ni "quedan 2 lugares" inventados: si llega y ve
// que era mentira, se pierde la venta y la confianza en todo lo demas.
async function enviarCorreoRecuperacionTaller({
  to, nombre, taller, fechaTaller, horario, sede, monto, venceEn, lugares,
  anticipo, link, esUltimo, unsubscribeUrl, numeroWhatsapp,
}) {
  const client = resendClient();
  if (!client) throw new Error('El envío de correos todavía no está configurado.');
  const from = process.env.RESEND_FROM || 'Endulcora <onboarding@resend.dev>';

  const hola = nombre ? `${nombre}, ` : '';
  const asunto = esUltimo
    ? `${nombre ? nombre + ', t' : 'T'}u lugar en ${taller} se libera mañana`
    : `${nombre ? nombre + ', t' : 'T'}u lugar en ${taller} sigue apartado`;

  const entrada = esUltimo
    ? `Te escribimos una última vez: tu lugar en <strong>${taller}</strong> sigue guardado, pero se libera <strong>${venceEn}</strong>. Después de esa hora vuelve a la lista y se lo puede llevar alguien más.`
    : `${hola}apartaste tu lugar en <strong>${taller}</strong> y el pago quedó a medias. No pasa nada: <strong>te lo seguimos guardando hasta ${venceEn}</strong>.`;

  const detalle = `
    <table style="width:100%;border-collapse:collapse;margin:18px 0;background:#FBF4E9;border-radius:14px;">
      <tr><td style="padding:16px 18px;">
        <p style="margin:0;font-size:15px;font-weight:700;color:#4E1454;">${taller}</p>
        <p style="margin:6px 0 0;font-size:14px;color:#1B0720;text-transform:capitalize;">${fechaTaller}</p>
        ${horario ? `<p style="margin:2px 0 0;font-size:14px;color:#1B0720;">${horario}</p>` : ''}
        ${sede ? `<p style="margin:2px 0 0;font-size:14px;color:#1B0720;">Sucursal ${sede}</p>` : ''}
        <p style="margin:10px 0 0;font-size:14px;color:#7A2E7E;">Te falta pagar <strong>$${formatoMonto(monto)} MXN</strong></p>
      </td></tr>
    </table>`;

  // Solo si de verdad quedan pocos y el dato salio de la base.
  const escasez = lugares
    ? `<p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#1B0720;">De este taller quedan <strong>${lugares} ${lugares === 1 ? 'lugar' : 'lugares'}</strong>, contando el tuyo.</p>`
    : '';

  // La objeción más común es el monto. Si había elegido pagar completo, se le
  // recuerda que con el anticipo basta para asegurarlo.
  const salida = anticipo
    ? `<p style="margin:14px 0 0;font-size:14px;line-height:1.6;color:#1B0720;">Si ahorita no te acomoda el pago completo, <strong>con $${formatoMonto(anticipo)} de anticipo tu lugar queda asegurado</strong> y lo demás lo liquidas el día del taller.</p>`
    : '';

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1B0720;">
      <p style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#7A2E7E;">Endulcora</p>
      <h1 style="font-size:20px;color:#4E1454;margin:6px 0 14px;">${esUltimo ? 'Último aviso de tu lugar' : 'Tu lugar sigue apartado'}</h1>
      <p style="margin:0 0 14px;font-size:14px;line-height:1.6;">${entrada}</p>
      ${detalle}
      ${escasez}
      <p style="margin:18px 0 6px;"><a href="${link}" style="display:inline-block;background:#4E1454;color:#FBF4E9;padding:13px 26px;border-radius:999px;text-decoration:none;font-weight:700;font-size:15px;">Terminar mi pago</a></p>
      ${salida}
      <p style="margin:18px 0 0;font-size:13px;line-height:1.6;color:#6b5a6e;">Si ya pagaste, ignora este correo: a veces el aviso del banco tarda unas horas en llegarnos.${numeroWhatsapp ? ` ¿Algún problema con el pago? Escríbenos por WhatsApp al ${numeroWhatsapp}.` : ''}</p>
      ${unsubscribeUrl ? `<p style="margin:20px 0 0;font-size:11px;color:#9C9C9C;"><a href="${unsubscribeUrl}" style="color:#9C9C9C;">Darme de baja de estos correos</a></p>` : ''}
    </div>`;

  const { error } = await client.emails.send({ from, to, subject: asunto, html });
  if (error) throw new Error(error.message || 'Resend rechazó el correo.');
  return { ok: true };
}

module.exports = {
  pieEndulcora,
  datosPie,
  botonPlan,
  plantillaPlan,
  enviarCorreoHtml,
  enviarCorreoRecordatorioVideoEnVivo,
  AVISO_DESCUENTOS_MASTER_CLASS,
  enviarCorreoAdjuntoEbook,
  enviarAvisoEquipoArchivoFaltante,
  htmlCorreoBuenFin,
  enviarCorreoBuenFin,
  enviarCorreoAccesoAnticipado,
  enviarCorreoAccesoConfirmado,
  enviarCorreoRegaloActivado,
  enviarCorreoRecordatorioRegalo,
  enviarCorreoConfirmacionCompra,
  enviarCorreoConfirmacionInscripcionTaller,
  enviarCorreoConfirmacionPagoTaller,
  enviarCorreoInfoYPagoTaller,
  correoConfirmacionPagoTaller,
  enviarCorreoRecordatorioTaller,
  enviarCorreoRecuperacionTaller,
  enviarCorreoRecetarioTaller,
  enviarCorreoEbooksTaller,
  enviarAvisoEquipoNuevoTaller,
  enviarCorreoConfirmacionClaseGratis,
  enviarCorreoConfirmarClaseGratis,
  enviarCorreoRecordatorioClaseGratis,
  linkAgregarCalendario,
  enviarCorreoRevistaMensual,
  enviarCorreoCampana,
  enviarCorreoLeadMagnetPaso0,
  enviarCorreoLeadMagnetPaso1,
  enviarCorreoLeadMagnetPaso2,
  enviarCorreoLeadMagnetPaso3,
  enviarCorreoRecordatorioMembresia,
};
