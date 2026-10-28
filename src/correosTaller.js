// Correo 11 del plan de ventas: el dia siguiente al taller (10:00 am CDMX),
// gracias, reseña y el ebook del mismo tema. Le llega a cada inscripcion
// pagada (en linea o registrada en sucursal) que tenga correo.
//
// La reseña se deja sin cuenta: el boton lleva a /resena con un link
// personal (id + token de la inscripcion); la reseña entra pendiente de
// aprobar en /admin, igual que las demas.
const crypto = require('crypto');
const store = require('./store');
const { SITE_URL } = require('./config');

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function normalizar(t) {
  return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function urlCompleta(url) {
  if (!url) return '';
  return /^https?:\/\//.test(url) ? url : `${SITE_URL}${url}`;
}

function diaCDMX(fecha) {
  return fecha.toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
}

// eBooks en PDF que se venden en el sitio (sin paquetes ni apps).
function ebooksVendibles() {
  return store.getProducts().filter((p) => p.categoria === 'ebook' && !p.esPaquete && !p.ocultoEnCatalogo && p.slug
    && /\.pdf$/i.test(String(p.archivo || '')));
}

// eBook del mismo tema: el que se eligio en /admin para ese taller (o para
// otra fecha del mismo taller), o el que se llama igual (o cuyo nombre esta
// dentro del nombre del taller, el mas largo).
function ebookDeTaller(titulo, sesion, { soloNombre = false } = {}) {
  const ebooks = ebooksVendibles();
  if (!soloNombre) {
    const mismoTaller = store.getSesionesTaller().filter((s) => s.ebookRelacionadoId && s.titulo === titulo)
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
    const id = (sesion && sesion.ebookRelacionadoId) || (mismoTaller[0] && mismoTaller[0].ebookRelacionadoId);
    const elegido = id ? store.getProduct(id) : null;
    if (elegido) return elegido;
  }
  const t = normalizar(titulo);
  if (!t) return null;
  const igual = ebooks.find((e) => normalizar(e.titulo) === t);
  if (igual) return igual;
  const parecidos = ebooks
    .filter((e) => { const n = normalizar(e.titulo); return n.length >= 4 && (t.includes(n) || n.includes(t)); })
    .sort((a, b) => normalizar(b.titulo).length - normalizar(a.titulo).length);
  return parecidos[0] || null;
}

function linkResena(inscripcion) {
  return `${SITE_URL}/resena?i=${inscripcion.id}&t=${inscripcion.resenaToken}`;
}

function correoGracias(inscripcion, sesion, contenido = store.getContent()) {
  const email = require('./email');
  const ebook = ebookDeTaller(inscripcion.taller || (sesion && sesion.titulo), sesion);
  const cuerpo = `
    <p>Hola${inscripcion.nombre ? ` ${esc(String(inscripcion.nombre).split(' ')[0])}` : ''}:</p>
    <p>Gracias por venir al taller de <strong>${esc(inscripcion.taller || '')}</strong>. Nos ayudas mucho si nos dejas tu opinión en un minuto:</p>
    ${email.botonPlan('Dejar mi reseña', linkResena(inscripcion))}
    ${ebook ? `<p>Si quieres seguir practicando en casa, el ebook <strong>${esc(ebook.titulo)}</strong> tiene las recetas paso a paso con costeo.</p>
    ${email.botonPlan('Ver ebook', `${SITE_URL}/ebooks/${ebook.slug}`, '#4E1454', '#FBF4E9')}` : ''}`;
  return {
    asunto: 'Gracias por cocinar con nosotros',
    html: email.plantillaPlan({ arteUrl: urlCompleta(sesion && sesion.fotoUrl), cuerpo, pie: email.pieEndulcora(email.datosPie(contenido)) }),
    ebook,
  };
}

let corriendo = false;
async function revisarGracias(ahora = new Date(), { pausaMs = 250 } = {}) {
  if (corriendo) return { enviados: 0 };
  corriendo = true;
  let enviados = 0;
  try {
    const contenido = store.getContent();
    if (contenido.taller_gracias_activo === 'false') return { enviados };
    const hora = Number(ahora.toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/Mexico_City' }));
    if (hora < 10) return { enviados };
    const ayer = diaCDMX(new Date(ahora.getTime() - 24 * 60 * 60 * 1000));
    const sesiones = store.getSesionesTaller();
    const pendientes = store.getInscripcionesTaller().filter((i) => i.estadoPago === 'pagado' && i.fecha === ayer && i.correo && !i.graciasEnviado);
    const { enviarCorreoHtml } = require('./email');
    for (const ins of pendientes) {
      try {
        const inscripcion = ins.resenaToken ? ins : store.marcarInscripcionTaller(ins.id, { resenaToken: crypto.randomBytes(16).toString('hex') });
        const sesion = sesiones.find((s) => s.id === inscripcion.sesionTallerId) || null;
        const { asunto, html } = correoGracias(inscripcion, sesion, contenido);
        await enviarCorreoHtml({ to: inscripcion.correo, asunto, html });
        store.marcarInscripcionTaller(inscripcion.id, { graciasEnviado: new Date().toISOString() });
        enviados += 1;
        if (pausaMs) await new Promise((r) => setTimeout(r, pausaMs));
      } catch (err) {
        console.error(`[taller] No se pudo mandar el correo de gracias a ${ins.correo}:`, err.message);
      }
    }
  } finally {
    corriendo = false;
  }
  return { enviados };
}

// ---- Pagina /resena (sin cuenta) ----
function inscripcionConToken(id, token) {
  const ins = store.getInscripcionTaller(id);
  if (!ins || !ins.resenaToken || !token || ins.resenaToken !== String(token)) return null;
  return ins;
}

function guardarResena(ins, { estrellas, texto }) {
  const limpio = String(texto || '').trim().slice(0, 1500);
  if (limpio.length < 5) return { error: 'Escribe tu opinión (al menos unas palabras).' };
  if (ins.resenaDejada) return { error: 'Ya nos dejaste tu reseña. ¡Gracias!' };
  const nombre = String(ins.nombre || '').trim().split(/\s+/);
  const nombreAutor = nombre.length > 1 ? `${nombre[0]} ${nombre[1][0]}.` : (nombre[0] || 'Alumna Endulcora');
  const resena = store.addResena({ userId: null, nombreAutor, texto: `${limpio}`, estrellas: Number(estrellas) || 5 });
  store.marcarInscripcionTaller(ins.id, { resenaDejada: new Date().toISOString() });
  return { ok: true, resena };
}

function paginaResena(ins, { enviada = false, error = '' } = {}) {
  const contenido = store.getContent();
  const nombre = String(ins.nombre || '').split(' ')[0];
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Tu reseña · Endulcora</title>
<style>
  :root{--crema:#FBF4E9;--vino:#4E1454;--flama:#F5A623;--carbon:#1B0720;--suave:#6b5a6e;--linea:rgba(78,20,84,.16)}
  *{box-sizing:border-box} body{margin:0;background:var(--crema);color:var(--carbon);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;line-height:1.5}
  main{max-width:560px;margin:0 auto;padding:28px 16px 48px} .marca{font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:#7A2E7E;font-weight:700}
  h1{color:var(--vino);font-size:26px;line-height:1.15;margin:6px 0 6px} p{margin:0 0 12px}
  .estrellas{display:flex;gap:6px;margin:8px 0 16px} .estrellas button{font-size:34px;line-height:1;background:none;border:0;cursor:pointer;color:#d8c9d9;padding:0}
  .estrellas button.on{color:var(--flama)} .estrellas button:focus-visible{outline:3px solid var(--vino);border-radius:6px}
  textarea{width:100%;min-height:140px;border:1px solid var(--linea);border-radius:14px;padding:12px;font:inherit;background:#fff}
  .boton{display:inline-block;margin-top:14px;background:var(--flama);color:var(--carbon);font-weight:700;border:0;border-radius:999px;padding:13px 24px;font-size:15px;cursor:pointer}
  .nota{font-size:13px;color:var(--suave)} .error{color:#b3261e;font-size:14px;margin-top:10px} .gracias{background:#fff;border:1px solid var(--linea);border-radius:16px;padding:18px}
</style></head><body><main>
  <span class="marca">Endulcora</span>
  ${enviada || ins.resenaDejada
    ? `<h1>¡Gracias${nombre ? `, ${esc(nombre)}` : ''}!</h1><div class="gracias"><p>Recibimos tu reseña. La publicamos en cuanto la revisemos.</p><p class="nota">Nos encantará verte en otro taller.</p><p><a href="${SITE_URL}/calendario" style="color:#4E1454;font-weight:700">Ver los próximos talleres</a></p></div>`
    : `<h1>¿Cómo te fue en ${esc(ins.taller || 'tu taller')}?</h1>
  <p class="nota">Tu opinión nos ayuda a mejorar y a que otras personas se animen a venir.</p>
  <form method="post" action="/resena?i=${ins.id}&t=${esc(ins.resenaToken)}" id="f">
    <input type="hidden" name="estrellas" id="estrellas" value="5">
    <div class="estrellas" role="radiogroup" aria-label="Calificación">${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="on" data-n="${n}" aria-label="${n} estrella${n > 1 ? 's' : ''}">★</button>`).join('')}</div>
    <label for="texto" class="nota">Tu reseña</label>
    <textarea id="texto" name="texto" required maxlength="1500" placeholder="¿Qué te gustó? ¿Qué aprendiste?"></textarea>
    ${error ? `<p class="error">${esc(error)}</p>` : ''}
    <button class="boton" type="submit">Enviar mi reseña</button>
  </form>`}
  ${contenido.whatsapp_numero ? `<p class="nota" style="margin-top:20px">¿Dudas? Escríbenos por WhatsApp: <a href="https://wa.me/521${esc(String(contenido.whatsapp_numero).replace(/\D/g, '').slice(-10))}" style="color:#4E1454">wa.me/521${esc(String(contenido.whatsapp_numero).replace(/\D/g, '').slice(-10))}</a></p>` : ''}
</main>
<script>
(function(){
  var botones = document.querySelectorAll('.estrellas button');
  var campo = document.getElementById('estrellas');
  botones.forEach(function(b){ b.addEventListener('click', function(){
    var n = Number(b.getAttribute('data-n')); campo.value = n;
    botones.forEach(function(x){ x.classList.toggle('on', Number(x.getAttribute('data-n')) <= n); });
  }); });
})();
</script></body></html>`;
}

function iniciarCorreosTaller() {
  setTimeout(() => revisarGracias().catch(() => {}), 4 * 60 * 1000);
  setInterval(() => revisarGracias().catch(() => {}), 30 * 60 * 1000);
}

module.exports = { ebooksVendibles, ebookDeTaller, correoGracias, revisarGracias, inscripcionConToken, guardarResena, paginaResena, iniciarCorreosTaller };
