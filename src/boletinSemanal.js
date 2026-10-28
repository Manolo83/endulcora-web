// Correo 13 del plan de ventas: boletin de cada lunes, 9:00 am (CDMX).
//
// El sitio lo arma solo con lo que ya esta en la base:
//   - Talleres de la semana (miercoles a domingo), por sucursal.
//   - La proxima masterclass, si hay una abierta con fecha futura.
//   - Un eBook de la semana (el que se elija en /admin, o rota entre los
//     mas vendidos segun el numero de semana).
//   - Taller destacado: el elegido en /admin o el que mas fechas tiene esa
//     semana; su foto es el arte del correo.
// Sin precios. Le llega a la comunidad: contactos que interactuaron en
// endulcora.com y no se han dado de baja (mismo filtro que la promocion).
//
// Se manda con el sistema de campañas (plantilla 'boletin'): se retoma solo
// si el servidor se reinicia y se puede cancelar desde /admin. Se apaga con
// boletin_activo = 'false' o se pausa una semana con boletin_pausado_lunes.
const store = require('./store');
const { SITE_URL } = require('./config');

const OFFSET_CDMX = '-06:00';
const HORA_ENVIO = 9;
const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function urlCompleta(url) {
  if (!url) return '';
  return /^https?:\/\//.test(url) ? url : `${SITE_URL}${url}`;
}

function diaCDMX(fecha) {
  return fecha.toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
}

function sumarDias(iso, dias) {
  const d = new Date(`${iso}T12:00:00${OFFSET_CDMX}`);
  d.setTime(d.getTime() + dias * 24 * 60 * 60 * 1000);
  return diaCDMX(d);
}

// Lunes (AAAA-MM-DD, CDMX) de la semana de `ahora`.
function lunesDe(ahora = new Date()) {
  const hoy = diaCDMX(ahora);
  const dow = new Date(`${hoy}T12:00:00${OFFSET_CDMX}`).getUTCDay();
  return sumarDias(hoy, -((dow + 6) % 7));
}

// Numero de semana desde una fecha fija, para rotar el eBook.
function numeroSemana(lunes) {
  return Math.floor((new Date(`${lunes}T12:00:00Z`).getTime() - Date.UTC(2026, 0, 5, 12)) / (7 * 24 * 60 * 60 * 1000));
}

function activo(contenido = store.getContent()) {
  return contenido.boletin_activo !== 'false';
}

function fechaLarga(iso) {
  return new Date(`${iso}T12:00:00${OFFSET_CDMX}`).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Mexico_City' }).replace(',', '');
}

function talleresDeLaSemana(lunes) {
  const desde = sumarDias(lunes, 2);
  const hasta = sumarDias(lunes, 6);
  return store.getSesionesTaller().filter((s) => s.fecha >= desde && s.fecha <= hasta && s.titulo);
}

function ebooksCandidatos() {
  return require('./correosTaller').ebooksVendibles();
}

function ebookDeLaSemana(lunes, contenido) {
  const elegido = Number(contenido.boletin_ebook_id);
  if (elegido) {
    const p = store.getProduct(elegido);
    if (p && p.slug) return p;
  }
  const vendibles = new Set(ebooksCandidatos().map((e) => e.id));
  const lista = require('./promoBuenFin').masVendidos(8).filter((e) => vendibles.has(e.id));
  const opciones = lista.length ? lista : ebooksCandidatos();
  if (!opciones.length) return null;
  const n = numeroSemana(lunes);
  return opciones[((n % opciones.length) + opciones.length) % opciones.length];
}

function tallerDestacado(talleres, contenido) {
  const elegido = String(contenido.boletin_taller_destacado || '').trim();
  if (elegido) {
    const s = talleres.find((t) => t.titulo === elegido) || store.getSesionesTaller().find((t) => t.titulo === elegido);
    if (s) return { titulo: s.titulo, fotoUrl: (talleres.find((t) => t.titulo === elegido && t.fotoUrl) || s).fotoUrl || '', slug: s.slug };
  }
  if (!talleres.length) return null;
  const conteo = new Map();
  talleres.forEach((t) => conteo.set(t.titulo, (conteo.get(t.titulo) || 0) + 1));
  const [titulo] = [...conteo.entries()].sort((a, b) => b[1] - a[1] || talleres.findIndex((t) => t.titulo === a[0]) - talleres.findIndex((t) => t.titulo === b[0]))[0];
  const conFoto = talleres.find((t) => t.titulo === titulo && t.fotoUrl) || talleres.find((t) => t.titulo === titulo);
  return { titulo, fotoUrl: conFoto.fotoUrl || '', slug: conFoto.slug };
}

function masterclass(contenido, lunes) {
  if (contenido.clasegratis_activo !== 'true' || !/^\d{4}-\d{2}-\d{2}$/.test(contenido.clasegratis_fecha || '')) return null;
  if (contenido.clasegratis_fecha < lunes) return null;
  return { titulo: String(contenido.clasegratis_titulo || '').replace(/^clase gratis:\s*/i, '').trim(), fecha: contenido.clasegratis_fecha };
}

// Todo lo que lleva el boletin de una semana (se guarda en la campaña para
// que, si se retoma tras un reinicio, salga igual a todos).
function armarDatos(ahora = new Date(), contenido = store.getContent()) {
  const lunes = lunesDe(ahora);
  const talleres = talleresDeLaSemana(lunes);
  const sedes = store.getSedes();
  const porSede = sedes.map((sede) => ({
    sede: String(sede.nombre || '').replace(/^endulcora\s+/i, ''),
    talleres: talleres.filter((t) => t.sedeId === sede.id).map((t) => {
      const d = new Date(`${t.fecha}T12:00:00${OFFSET_CDMX}`);
      return { dia: `${DIAS_CORTOS[d.getUTCDay()]} ${Number(t.fecha.slice(8))}`, horario: t.horario || '', titulo: t.titulo, agotado: t.estado === 'agotado' || t.cupoRestante === 0 };
    }),
  })).filter((g) => g.talleres.length);
  const destacado = tallerDestacado(talleres, contenido);
  const ebook = ebookDeLaSemana(lunes, contenido);
  const mc = masterclass(contenido, lunes);
  return {
    semana: lunes,
    porSede,
    destacado,
    masterclass: mc ? { ...mc, fechaTexto: fechaLarga(mc.fecha) } : null,
    ebook: ebook ? { id: ebook.id, titulo: ebook.titulo, slug: ebook.slug } : null,
    asunto: `Esta semana en Endulcora${destacado ? `: ${destacado.titulo}` : ''}`,
  };
}

function hayContenido(datos) {
  return datos.porSede.length > 0 || !!datos.masterclass;
}

function htmlBoletin(datos, { nombre = '', unsubscribeUrl = '' } = {}, contenido = store.getContent()) {
  const email = require('./email');
  const listas = datos.porSede.map((g) => `
    <p style="margin:12px 0 2px;font-weight:700;color:#4E1454;">${esc(g.sede)}</p>
    <ul style="margin:0 0 6px;padding-left:18px;">${g.talleres.map((t) => `<li>${esc(t.dia)}${t.horario ? ` · ${esc(t.horario)}` : ''} · ${esc(t.titulo)}${t.agotado ? ' <span style="color:#6b5a6e;">(agotado)</span>' : ''}</li>`).join('')}</ul>`).join('');
  const cuerpo = `
    <p>Hola${nombre ? ` ${esc(String(nombre).split(' ')[0])}` : ''}:</p>
    ${datos.porSede.length ? `<p style="margin-bottom:0;"><strong>Talleres de esta semana</strong></p>${listas}
    ${email.botonPlan('Ver los talleres', `${SITE_URL}/calendario`)}` : ''}
    ${datos.masterclass ? `<p style="margin-top:18px;"><strong>Próxima masterclass:</strong> ${esc(datos.masterclass.titulo)}, ${esc(datos.masterclass.fechaTexto)}.</p>
    ${email.botonPlan('Registrarme gratis', `${SITE_URL}/clase-gratis`, '#4E1454', '#FBF4E9')}` : ''}
    ${datos.ebook ? `<p style="margin-top:18px;"><strong>eBook de la semana:</strong> ${esc(datos.ebook.titulo)}.</p>
    ${email.botonPlan('Ver eBook', `${SITE_URL}/ebooks/${datos.ebook.slug}`, '#F3E6F1', '#4E1454')}` : ''}`;
  const baja = unsubscribeUrl
    ? `<p style="font-size:11px;color:#6b5a6e;margin:8px 0 0;">Recibiste este correo porque estás en la comunidad de endulcora.com. <a href="${esc(unsubscribeUrl)}" style="color:#7A2E7E;">Dejar de recibir estos correos</a></p>`
    : '';
  return email.plantillaPlan({
    arteUrl: urlCompleta(datos.destacado && datos.destacado.fotoUrl),
    cuerpo,
    pie: email.pieEndulcora(email.datosPie(contenido)) + baja,
    preheader: datos.porSede.length ? 'Los talleres de esta semana en Nativitas y División del Norte.' : '',
  });
}

async function enviarBoletin({ to, nombre, unsubscribeUrl, datos }) {
  const { enviarCorreoHtml } = require('./email');
  return enviarCorreoHtml({
    to,
    asunto: datos.asunto,
    html: htmlBoletin(datos, { nombre, unsubscribeUrl }),
    headers: unsubscribeUrl ? { 'List-Unsubscribe': `<${unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } : undefined,
  });
}

function destinatarios() {
  const interaccion = store.correosConInteraccion();
  return store.getContactosCampana().filter((c) => c.activo !== false && interaccion.has(c.email));
}

function campanaDeLaSemana(lunes) {
  return store.getCampanasCorreo().find((c) => c.plantilla === 'boletin' && c.semana === lunes) || null;
}

// Hora (Date) en que sale el boletin del lunes dado.
function horaEnvio(lunes) {
  return new Date(`${lunes}T${String(HORA_ENVIO).padStart(2, '0')}:00:00${OFFSET_CDMX}`);
}

// Lo que se ve en /admin: el boletin de esta semana (si ya salio) y el que
// sigue.
function estado(ahora = new Date()) {
  const contenido = store.getContent();
  const lunesActual = lunesDe(ahora);
  const actual = campanaDeLaSemana(lunesActual);
  const proximoLunes = actual || ahora >= horaEnvio(lunesActual) ? sumarDias(lunesActual, 7) : lunesActual;
  const datosProximo = armarDatos(horaEnvio(proximoLunes), contenido);
  let estadoProximo = 'programado';
  if (!activo(contenido)) estadoProximo = 'apagado';
  else if (contenido.boletin_pausado_lunes === proximoLunes) estadoProximo = 'pausado';
  else if (!hayContenido(datosProximo)) estadoProximo = 'sin_contenido';
  const ultimos = store.getCampanasCorreo().filter((c) => c.plantilla === 'boletin')
    .sort((a, b) => String(b.semana).localeCompare(String(a.semana))).slice(0, 4)
    .map((c) => ({ id: c.id, semana: c.semana, asunto: c.asunto, estado: c.estado, enviados: c.enviados, fallidos: c.fallidos, total: c.total }));
  return {
    activo: activo(contenido),
    proximo: {
      lunes: proximoLunes,
      hora: horaEnvio(proximoLunes).toISOString(),
      estado: estadoProximo,
      destinatarios: destinatarios().length,
      asunto: datosProximo.asunto,
      destacado: datosProximo.destacado ? datosProximo.destacado.titulo : '',
      ebook: datosProximo.ebook ? datosProximo.ebook.titulo : '',
      talleres: datosProximo.porSede.reduce((n, g) => n + g.talleres.length, 0),
      masterclass: !!datosProximo.masterclass,
    },
    ultimos,
    opciones: {
      talleres: [...new Set(store.getSesionesTaller().filter((s) => s.fecha >= diaCDMX(ahora) && s.titulo).map((s) => s.titulo))].sort((a, b) => a.localeCompare(b, 'es')),
      ebooks: ebooksCandidatos().map((e) => ({ id: e.id, titulo: e.titulo })).sort((a, b) => a.titulo.localeCompare(b.titulo, 'es')),
    },
    elegidos: {
      taller: contenido.boletin_taller_destacado || '',
      ebookId: contenido.boletin_ebook_id || '',
      pausadoLunes: contenido.boletin_pausado_lunes || '',
    },
  };
}

// Crea la campaña del lunes si ya toca. Regresa la campaña o null.
function revisar(ahora = new Date()) {
  const contenido = store.getContent();
  if (!activo(contenido)) return null;
  const lunes = lunesDe(ahora);
  if (diaCDMX(ahora) !== lunes || ahora < horaEnvio(lunes)) return null;
  if (contenido.boletin_pausado_lunes === lunes || campanaDeLaSemana(lunes)) return null;
  const datos = armarDatos(ahora, contenido);
  if (!hayContenido(datos)) return null;
  const lista = destinatarios();
  if (!lista.length) return null;
  const campana = store.addCampanaCorreo({ asunto: datos.asunto, cuerpoHtml: '', plantilla: 'boletin', contactoIds: lista.map((c) => c.id) });
  store.actualizarCampanaCorreo(campana.id, { semana: lunes, datosBoletin: datos });
  // Lo elegido a mano era para esta semana; la siguiente vuelve a ser
  // automatica.
  if (contenido.boletin_taller_destacado || contenido.boletin_ebook_id) {
    store.updateContent({ boletin_taller_destacado: '', boletin_ebook_id: '' });
  }
  require('./campanas').procesarCampana(campana.id).catch(() => {});
  return campana;
}

function iniciarBoletinSemanal() {
  const vuelta = () => {
    try { revisar(); } catch (err) { console.error('[boletin] Falló la revisión:', err.message); }
  };
  setTimeout(vuelta, 4 * 60 * 1000);
  setInterval(vuelta, 10 * 60 * 1000);
}

module.exports = { lunesDe, armarDatos, htmlBoletin, enviarBoletin, destinatarios, estado, revisar, horaEnvio, iniciarBoletinSemanal };
