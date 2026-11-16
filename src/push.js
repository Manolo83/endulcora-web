// App de Endulcora (PWA): suscripciones a notificaciones push y envio
// automatico con la informacion del sitio (talleres, clases en vivo, eBooks
// y nurturing diario). Pedido por Manuel el 16 nov 2026: «quiero que tu hagas
// este envio de notificaciones de forma automatica segun la informacion de
// Endulcora, no que yo tenga que enviar estos mensajes».
//
// Las llaves VAPID se generan solas la primera vez y se guardan en la base
// (tabla push_config), asi no hace falta configurar nada en Railway. Si se
// definen VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY en el entorno, mandan esas.
const { Pool } = require('pg');
const webpush = require('web-push');
const store = require('./store');

const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL }) : null;
const SITE = 'https://www.endulcora.com';
const MAX_AL_DIA = 3; // tope de avisos automaticos por dia (sin contar los de clase en vivo)
const HORA_INICIO = 9; // no se manda nada antes de las 9 ni despues de las 21 (CDMX)
const HORA_FIN = 21;
const NURTURING_HORAS = [11, 18];

let llaves = null;

async function q(sql, params) {
  if (!pool) throw new Error('Sin base de datos');
  return pool.query(sql, params);
}

async function getConfig(clave) {
  const r = await q('SELECT valor FROM push_config WHERE clave = $1', [clave]);
  return r.rows[0] ? r.rows[0].valor : null;
}
async function setConfig(clave, valor) {
  await q('INSERT INTO push_config (clave, valor) VALUES ($1, $2) ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor', [clave, valor]);
}

async function init() {
  if (!pool) return;
  await q(`CREATE TABLE IF NOT EXISTS push_config (clave TEXT PRIMARY KEY, valor TEXT)`);
  await q(`CREATE TABLE IF NOT EXISTS push_subs (
    id SERIAL PRIMARY KEY, endpoint TEXT UNIQUE NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL,
    user_id INTEGER, plataforma TEXT, creado_en TIMESTAMPTZ DEFAULT now(), activo BOOLEAN DEFAULT true)`);
  await q(`CREATE TABLE IF NOT EXISTS push_envios (
    id SERIAL PRIMARY KEY, clave TEXT UNIQUE NOT NULL, tipo TEXT, titulo TEXT, cuerpo TEXT, url TEXT, imagen TEXT,
    enviado_en TIMESTAMPTZ DEFAULT now(), total INTEGER DEFAULT 0, ok INTEGER DEFAULT 0, fallidos INTEGER DEFAULT 0, abiertas INTEGER DEFAULT 0)`);
  await q('ALTER TABLE push_subs ADD COLUMN IF NOT EXISTS bienvenida BOOLEAN DEFAULT false');
  let pub = process.env.VAPID_PUBLIC_KEY || (await getConfig('vapid_public'));
  let priv = process.env.VAPID_PRIVATE_KEY || (await getConfig('vapid_private'));
  if (!pub || !priv) {
    const k = webpush.generateVAPIDKeys();
    pub = k.publicKey; priv = k.privateKey;
    await setConfig('vapid_public', pub);
    await setConfig('vapid_private', priv);
  }
  llaves = { pub, priv };
  webpush.setVapidDetails('mailto:hola@endulcora.com', pub, priv);
}

function clavePublica() { return llaves ? llaves.pub : null; }

async function suscribir(sub, { userId, plataforma } = {}) {
  if (!sub || !sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) throw new Error('Suscripcion invalida');
  if (!/^https:\/\//.test(sub.endpoint)) throw new Error('Suscripcion invalida');
  await q(`INSERT INTO push_subs (endpoint, p256dh, auth, user_id, plataforma) VALUES ($1,$2,$3,$4,$5)
    ON CONFLICT (endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, activo = true,
    user_id = COALESCE(EXCLUDED.user_id, push_subs.user_id), plataforma = COALESCE(EXCLUDED.plataforma, push_subs.plataforma)`,
    [sub.endpoint, sub.keys.p256dh, sub.keys.auth, userId || null, String(plataforma || '').slice(0, 40) || null]);
  setTimeout(() => mandarBienvenidas().catch(() => {}), 1500);
}

// Bienvenida: le llega una sola vez a cada telefono que activa los avisos
// (tambien a los que ya estaban activos antes de existir este aviso).
const BIENVENIDA = { clave: 'bienvenida', titulo: '🧁 ¡Bienvenida a la app de Endulcora!', cuerpo: 'Aquí te avisaremos primero de talleres nuevos, clases en vivo y lugares que se acaban. Toca para ver los talleres de esta semana.', url: SITE + '/calendario?utm_source=app&utm_medium=push&utm_campaign=bienvenida' };
async function mandarBienvenidas() {
  const subs = (await q('SELECT id, endpoint, p256dh, auth FROM push_subs WHERE activo AND NOT bienvenida')).rows;
  for (const s of subs) {
    await q('UPDATE push_subs SET bienvenida = true WHERE id = $1', [s.id]);
    await mandarA([s], BIENVENIDA);
  }
  return subs.length;
}

async function baja(endpoint) {
  await q('UPDATE push_subs SET activo = false WHERE endpoint = $1', [endpoint]);
}

async function marcarAbierta(envioId) {
  await q('UPDATE push_envios SET abiertas = abiertas + 1 WHERE id = $1', [Number(envioId) || 0]);
}

async function enPausa() { return (await getConfig('pausa')) === '1'; }
async function setPausa(v) { await setConfig('pausa', v ? '1' : '0'); }

async function mandarA(subs, payload) {
  let ok = 0, fallidos = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 60 * 60 * 12 });
      ok += 1;
    } catch (e) {
      fallidos += 1;
      if (e.statusCode === 404 || e.statusCode === 410) await baja(s.endpoint).catch(() => {});
    }
  }
  return { ok, fallidos };
}

// Manda un aviso a todos una sola vez por clave (si la clave ya salio, no
// se repite). Regresa el envio o null si no salio.
async function enviar({ clave, tipo, titulo, cuerpo, url, imagen }, { forzar = false } = {}) {
  if (!llaves) return null;
  if (!forzar && (await enPausa())) return null;
  const ins = await q(`INSERT INTO push_envios (clave, tipo, titulo, cuerpo, url, imagen) VALUES ($1,$2,$3,$4,$5,$6)
    ON CONFLICT (clave) DO NOTHING RETURNING id`, [clave, tipo, titulo, cuerpo, url, imagen || null]);
  if (!ins.rows[0]) return null;
  const id = ins.rows[0].id;
  const subs = (await q('SELECT endpoint, p256dh, auth FROM push_subs WHERE activo')).rows;
  const r = await mandarA(subs, { clave, titulo, cuerpo, url, imagen, envio: id });
  await q('UPDATE push_envios SET total = $2, ok = $3, fallidos = $4 WHERE id = $1', [id, subs.length, r.ok, r.fallidos]);
  return { id, total: subs.length, ...r };
}

// Prueba a un solo dispositivo (el del admin), sin quedar en el historial.
async function probar(endpoint, aviso) {
  const r = (await q('SELECT endpoint, p256dh, auth FROM push_subs WHERE endpoint = $1', [endpoint])).rows;
  if (!r.length) throw new Error('Este dispositivo aun no activa los avisos');
  return mandarA(r, { ...aviso, clave: 'prueba-' + Date.now() });
}

async function resumen() {
  const subs = (await q(`SELECT count(*) FILTER (WHERE activo) AS activos, count(*) AS total,
    count(*) FILTER (WHERE activo AND creado_en > now() - interval '7 days') AS nuevos7 FROM push_subs`)).rows[0];
  const envios = (await q('SELECT id, tipo, titulo, cuerpo, url, enviado_en, total, ok, fallidos, abiertas FROM push_envios ORDER BY enviado_en DESC LIMIT 50')).rows;
  return { activos: Number(subs.activos), total: Number(subs.total), nuevos7: Number(subs.nuevos7), pausa: await enPausa(), envios, proximos: await proximos() };
}

// ---------- Avisos automaticos ----------
function ahoraCdmx() {
  const d = new Date(Date.now() - 6 * 3600 * 1000); // Mexico ya no cambia de horario
  return { fecha: d.toISOString().slice(0, 10), hora: d.getUTCHours(), min: d.getUTCMinutes(), dia: d.getUTCDay(), ms: Date.now() };
}
function sumarDias(f, n) { return new Date(new Date(f + 'T12:00:00Z').getTime() + n * 86400000).toISOString().slice(0, 10); }
function fechaCorta(f) { const s = new Date(f + 'T12:00:00Z').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }); return s.charAt(0).toUpperCase() + s.slice(1); }
function titulo(t) { const s = String(t || '').toLowerCase(); return s.replace(/(^|\s)\S/g, (m) => m.toUpperCase()); }
function img(u) { return u ? (u.startsWith('http') ? u : SITE + u) : undefined; }
function utm(u, c) { return u + (u.includes('?') ? '&' : '?') + 'utm_source=app&utm_medium=push&utm_campaign=' + c; }

async function enviadosHoy(fecha) {
  const r = await q(`SELECT count(*) AS n FROM push_envios WHERE tipo <> 'vivo' AND tipo <> 'manual' AND (enviado_en - interval '6 hours')::date = $1::date`, [fecha]);
  return Number(r.rows[0].n);
}
async function ultimoEnvioHaceMin() {
  const r = await q(`SELECT EXTRACT(EPOCH FROM now() - max(enviado_en)) / 60 AS m FROM push_envios WHERE tipo <> 'manual'`);
  return r.rows[0].m == null ? 1e9 : Number(r.rows[0].m);
}

function sesionesFuturas(hoy) {
  const sedes = Object.fromEntries(store.getSedes().map((s) => [s.id, s.nombre]));
  return store.getSesionesTaller()
    .filter((s) => s.fecha >= hoy && s.slug && s.estado !== 'agotado' && s.cupoRestante !== 0)
    .map((s) => ({ ...s, sede: sedes[s.sedeId] || '' }));
}

// Clase en vivo (1 h antes y al empezar), segun la config de /admin.
function avisosClaseEnVivo(t) {
  const c = store.getContent();
  if (String(c.clase_mostrar) !== 'true') return [];
  const [hh, mm] = String(c.clase_hora || '19:00').split(':').map((n) => parseInt(n, 10) || 0);
  let fecha = c.clase_fecha_especifica || '';
  if (!fecha) {
    const dia = parseInt(c.clase_dia_semana, 10) || 0;
    fecha = sumarDias(t.fecha, (dia - t.dia + 7) % 7);
  }
  const inicio = Date.parse(`${fecha}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00-06:00`);
  const falta = (inicio - t.ms) / 60000;
  const nombre = String(c.clase_titulo || 'la clase en vivo').replace(/\s+/g, ' ').trim();
  const url = utm(SITE + '/endulcora-en-vivo', 'clase-vivo');
  if (falta <= 62 && falta > 45) return [{ clave: `vivo-${fecha}-1h`, tipo: 'vivo', titulo: '🎥 En 1 hora: clase en vivo', cuerpo: `${nombre}. Prepara tu libreta y entra a tiempo.`, url }];
  if (falta <= 2 && falta > -12) return [{ clave: `vivo-${fecha}-ya`, tipo: 'vivo', titulo: '🔴 ¡Ya estamos en vivo!', cuerpo: `${nombre}. Entra ahora y pregunta en el chat.`, url }];
  return [];
}

// Talleres nuevos en el calendario: el primer arranque solo memoriza lo que
// ya hay, para no mandar 50 avisos de golpe.
async function avisoTallerNuevo(t) {
  const futuras = sesionesFuturas(t.fecha);
  const vistos = JSON.parse((await getConfig('slugs_vistos')) || 'null');
  const slugs = [...new Set(futuras.map((s) => s.slug))];
  if (!vistos) { await setConfig('slugs_vistos', JSON.stringify(slugs)); return null; }
  const nuevo = slugs.find((s) => !vistos.includes(s));
  if (!nuevo) return null;
  await setConfig('slugs_vistos', JSON.stringify([...new Set([...vistos, ...slugs])]));
  const ses = futuras.filter((s) => s.slug === nuevo);
  const s = ses[0];
  const fechas = ses.slice(0, 3).map((x) => `${fechaCorta(x.fecha)}${x.sede ? ' en ' + x.sede : ''}`).join(' · ');
  return { clave: `taller-nuevo-${nuevo}`, tipo: 'taller', titulo: `✨ Taller nuevo: ${titulo(s.titulo)}`, cuerpo: `${fechas}. Aparta tu lugar con $400.`, url: utm(`${SITE}/talleres/${nuevo}`, 'taller-nuevo'), imagen: img(s.fotoUrl) };
}

async function avisoCalendarioNuevo(t) {
  const futuras = sesionesFuturas(t.fecha);
  const meses = [...new Set(futuras.map((s) => s.fecha.slice(0, 7)))];
  const vistos = JSON.parse((await getConfig('meses_vistos')) || 'null');
  if (!vistos) { await setConfig('meses_vistos', JSON.stringify(meses)); return null; }
  const nuevo = meses.find((m) => !vistos.includes(m));
  if (!nuevo) return null;
  await setConfig('meses_vistos', JSON.stringify([...vistos, nuevo]));
  const nombreMes = new Date(nuevo + '-15T12:00:00Z').toLocaleDateString('es-MX', { month: 'long', timeZone: 'UTC' });
  return { clave: `calendario-${nuevo}`, tipo: 'calendario', titulo: `📅 Ya salió el calendario de ${nombreMes}`, cuerpo: 'Nuevos talleres en Nativitas y División. Los lugares se apartan rápido.', url: utm(SITE + '/calendario', 'calendario-nuevo') };
}

function avisoPocosLugares(t) {
  const prox = sesionesFuturas(t.fecha).filter((s) => s.fecha <= sumarDias(t.fecha, 6) && s.cupoRestante != null && s.cupoRestante > 0 && s.cupoRestante <= 3);
  const s = prox[0];
  if (!s) return null;
  return { clave: `pocos-${s.id}`, tipo: 'pocos', titulo: `⏳ Quedan ${s.cupoRestante} lugares: ${titulo(s.titulo)}`, cuerpo: `${fechaCorta(s.fecha)}${s.sede ? ' en ' + s.sede : ''}. Aparta hoy con $400.`, url: utm(`${SITE}/talleres/${s.slug}`, 'pocos-lugares'), imagen: img(s.fotoUrl) };
}

async function avisoEbookNuevo() {
  const ebooks = store.getProducts().filter((p) => p.categoria === 'ebook' && !p.oculto && p.slug);
  const vistos = JSON.parse((await getConfig('ebooks_vistos')) || 'null');
  const ids = ebooks.map((p) => p.id);
  if (!vistos) { await setConfig('ebooks_vistos', JSON.stringify(ids)); return null; }
  const p = ebooks.find((e) => !vistos.includes(e.id));
  if (!p) return null;
  await setConfig('ebooks_vistos', JSON.stringify([...vistos, p.id]));
  return { clave: `ebook-${p.id}`, tipo: 'ebook', titulo: `📚 eBook nuevo: ${p.titulo}`, cuerpo: `Recetas paso a paso con costeo, PDF + app para tu celular. $${p.precio}.`, url: utm(`${SITE}/ebooks/${p.slug}`, 'ebook-nuevo'), imagen: img(p.imagen) };
}

// Nurturing: 2 al dia, rotando temas con lo que hay vigente en el sitio.
function opcionesNurturing(t) {
  const ops = [];
  const semana = sesionesFuturas(t.fecha).filter((s) => s.fecha <= sumarDias(t.fecha, 7));
  const porTaller = [...new Map(semana.map((s) => [s.slug, s])).values()];
  porTaller.forEach((s) => ops.push({ tema: 'taller-' + s.slug, titulo: `👩‍🍳 Esta semana: ${titulo(s.titulo)}`, cuerpo: `${fechaCorta(s.fecha)}${s.sede ? ' en ' + s.sede : ''}. 4 horas de práctica, aparta con $400.`, url: utm(`${SITE}/talleres/${s.slug}`, 'nurturing'), imagen: img(s.fotoUrl) }));
  if (semana.length) ops.push({ tema: 'semana', titulo: '🔥 Talleres de esta semana', cuerpo: `${porTaller.length} talleres en Nativitas y División. Elige el tuyo y aparta con $400.`, url: utm(SITE + '/calendario', 'nurturing') });
  ops.push({ tema: 'club', titulo: '💜 Club Endulcora: tu primer mes gratis', cuerpo: 'Recetario del mes, taller en línea, todos los eBooks y 2 talleres al mes a $600.', url: utm(SITE + '/membresia', 'nurturing') });
  const ebooks = store.getProducts().filter((p) => p.categoria === 'ebook' && !p.oculto && p.slug && !p.esPaquete);
  if (ebooks.length) {
    const p = ebooks[(Number(t.fecha.replace(/-/g, '')) + t.hora) % ebooks.length];
    ops.push({ tema: 'ebook-' + p.id, titulo: `📖 ${p.titulo}`, cuerpo: 'Recetas paso a paso con costeo: PDF + app para tu celular por $150.', url: utm(`${SITE}/ebooks/${p.slug}`, 'nurturing'), imagen: img(p.imagen) });
  }
  ops.push({ tema: 'clase-gratis', titulo: '🎁 Clase gratis con el chef', cuerpo: 'Regístrate a la próxima clase demo y llévate ideas para vender más.', url: utm(SITE + '/clase-gratis', 'nurturing') });
  return ops;
}

async function avisoNurturing(t) {
  if (!NURTURING_HORAS.includes(t.hora) || t.min >= 30) return null;
  const ops = opcionesNurturing(t);
  if (!ops.length) return null;
  const recientes = (await q(`SELECT clave FROM push_envios WHERE tipo = 'nurturing' ORDER BY enviado_en DESC LIMIT 6`)).rows.map((r) => r.clave.split('|')[1]);
  const o = ops.find((x) => !recientes.includes(x.tema)) || ops[0];
  return { clave: `nurt-${t.fecha}-${t.hora}|${o.tema}`, tipo: 'nurturing', titulo: o.titulo, cuerpo: o.cuerpo, url: o.url, imagen: o.imagen };
}

// Lo que saldria en la proxima vuelta (para la vista previa del panel).
async function proximos() {
  const t = ahoraCdmx();
  const ops = opcionesNurturing(t).slice(0, 6);
  return ops.map((o) => ({ tipo: 'nurturing', titulo: o.titulo, cuerpo: o.cuerpo, url: o.url, imagen: o.imagen }));
}

let corriendo = false;
async function revisar() {
  if (corriendo || !llaves) return;
  corriendo = true;
  try {
    if (await enPausa()) return;
    const t = ahoraCdmx();
    for (const a of avisosClaseEnVivo(t)) await enviar(a);
    if (t.hora < HORA_INICIO || t.hora >= HORA_FIN) return;
    if ((await enviadosHoy(t.fecha)) >= MAX_AL_DIA) return;
    if ((await ultimoEnvioHaceMin()) < 120) return; // al menos 2 h entre avisos
    const candidatos = [avisoCalendarioNuevo, avisoTallerNuevo, avisoEbookNuevo, avisoPocosLugares, avisoNurturing];
    for (const f of candidatos) {
      const a = await f(t);
      if (a) { await enviar(a); break; }
    }
  } catch (e) {
    console.error('[push] Error en avisos automaticos:', e.message);
  } finally {
    corriendo = false;
  }
}

function iniciar() {
  init().then(() => {
    setTimeout(() => mandarBienvenidas().catch((e) => console.error('[push] bienvenida:', e.message)), 20 * 1000);
    setTimeout(revisar, 60 * 1000);
    setInterval(revisar, 10 * 60 * 1000);
  }).catch((e) => console.error('[push] No se pudo iniciar:', e.message));
}

// Prueba de nurturing a TODOS los telefonos activos (pedido de Manuel cuando
// solo el tenia la app). No cuenta para el tope diario.
async function nurturingPrueba() {
  const o = opcionesNurturing(ahoraCdmx())[0];
  const subs = (await q('SELECT endpoint, p256dh, auth FROM push_subs WHERE activo')).rows;
  const r = await mandarA(subs, { clave: 'prueba-nurt-' + Date.now(), titulo: o.titulo, cuerpo: o.cuerpo, url: o.url, imagen: o.imagen });
  return { total: subs.length, ...r, aviso: o };
}

module.exports = { nurturingPrueba, iniciar, clavePublica, suscribir, baja, marcarAbierta, enviar, probar, resumen, setPausa, opcionesNurturing, ahoraCdmx };
