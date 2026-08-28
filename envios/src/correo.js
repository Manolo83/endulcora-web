const { Resend } = require('resend');

// Envio del reconocimiento por correo. Se apoya en Resend, el mismo servicio
// que ya usa endulcora.com, para no sumar otra cuenta que administrar.

function cliente() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
}

function estaConfigurado() {
  return Boolean(process.env.RESEND_API_KEY);
}

function cuerpoHtml({ nombre, taller }) {
  const primerNombre = String(nombre || '').trim().split(' ')[0] || '';
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:28px;color:#1B0720;">
      <p style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#7A2E7E;margin:0;">Endulcora · Estudio Gastronómico</p>
      <h1 style="font-size:22px;color:#4E1454;margin:12px 0 0;">¡Felicidades, ${primerNombre}!</h1>
      <p style="font-size:15px;line-height:1.65;">
        Aquí está tu reconocimiento por haber completado el taller de
        <strong>${taller}</strong>. Lo encuentras adjunto a este correo en PDF,
        listo para guardar o imprimir.
      </p>
      <p style="font-size:15px;line-height:1.65;">
        Gracias por cocinar con nosotros. Te esperamos en el siguiente taller.
      </p>
      <p style="margin-top:28px;font-size:12px;color:#9C9C9C;line-height:1.6;">
        Recibes este correo porque participaste en un taller de Endulcora.
        Si tienes cualquier duda, respóndenos a este mismo mensaje.
      </p>
    </div>`;
}

async function enviarReconocimiento({ to, nombre, taller, pdf, nombreArchivo }) {
  const resend = cliente();
  if (!resend) throw new Error('Falta configurar RESEND_API_KEY para poder enviar correos.');

  const from = process.env.RESEND_FROM || 'Endulcora <onboarding@resend.dev>';
  const respuesta = await resend.emails.send({
    from,
    to,
    subject: `Tu reconocimiento del taller de ${taller} · Endulcora`,
    html: cuerpoHtml({ nombre, taller }),
    attachments: [{ filename: nombreArchivo || 'reconocimiento.pdf', content: pdf.toString('base64') }],
  });

  // Resend regresa el error dentro de la respuesta en vez de lanzarlo.
  if (respuesta && respuesta.error) {
    throw new Error(respuesta.error.message || 'Resend rechazó el envío.');
  }
  return respuesta;
}

module.exports = { enviarReconocimiento, estaConfigurado };
