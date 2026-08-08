const { Resend } = require('resend');
const { SITE_URL } = require('./config');

function resendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
}

async function enviarCorreoRecuperacion({ to, resetUrl }) {
  const client = resendClient();
  if (!client) throw new Error('El envío de correos todavía no está configurado.');

  const from = process.env.RESEND_FROM || 'Endulcora <onboarding@resend.dev>';
  await client.emails.send({
    from,
    to,
    subject: 'Recupera tu contraseña · Endulcora',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1B0720;">
        <p style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#7A2E7E;">Endulcora</p>
        <h1 style="font-size:20px;color:#4E1454;">Restablece tu contraseña</h1>
        <p style="font-size:14px;line-height:1.6;">
          Recibimos una solicitud para restablecer la contraseña de tu cuenta en
          <a href="${SITE_URL}" style="color:#4E1454;">endulcora.com</a>. Si no fuiste tú, puedes ignorar este correo.
        </p>
        <p style="margin:28px 0;">
          <a href="${resetUrl}" style="background:#F5A623;color:#1B0720;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:700;font-size:13px;text-transform:uppercase;letter-spacing:.05em;">
            Elegir nueva contraseña
          </a>
        </p>
        <p style="font-size:12px;color:#9C9C9C;">Este enlace es válido por 1 hora.</p>
      </div>
    `,
  });
}

module.exports = { enviarCorreoRecuperacion };
