// Correos de la masterclass del plan de ventas (correos 1 a 6):
//
// 1. Confirmacion de registro (al registrarse), con el acceso anticipado.
// 2. Recordatorio un dia antes (10:00 am), a todos los registrados.
// 3. "Empezamos en 1 hora", con el link para entrar a la clase.
// 4. Grabacion y oferta del taller, 2 horas despues de que termina su
//    horario (espera a que este puesto el link de la grabacion).
// 5. "Tu precio especial vence mañana" (dia 2, 10:00 am).
// 6. Ultimo aviso (dia 3, 10:00 am).
//
// Sin precios de talleres: el precio especial se menciona y se aplica en
// sucursal mostrando el correo o la ficha. 2 a 6 solo corren para
// masterclasses con fecha desde masterclass_correos_desde y se apagan con
// masterclass_correos_activo.
const store = require('./store');
const acceso = require('./accesoAnticipado');
const { SITE_URL } = require('./config');

const OFFSET_CDMX = '-06:00';
const HORA_MS = 60 * 60 * 1000;
const DIA_MS = 24 * HORA_MS;

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function hoyCDMX(ahora = new Date()) {
  return ahora.toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
}

// "AAAA-MM-DD" + n dias, a las HH:MM de CDMX.
function enCDMX(fecha, dias = 0, hora = '00:00') {
  const base = new Date(`${fecha}T12:00:00${OFFSET_CDMX}`);
  const dia = new Date(base.getTime() + dias * DIA_MS).toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
  return new Date(`${dia}T${hora}:00${OFFSET_CDMX}`);
}

// "11:00 am", "1:30 pm", "16:00" -> fecha y hora de inicio en CDMX.
function horaInicio(fecha, horario) {
  const m = String(horario || '').trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(a\.?\s*m\.?|p\.?\s*m\.?)?/);
  if (!fecha || !m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] || 0);
  const ampm = (m[3] || '').replace(/[\s.]/g, '');
  if (ampm === 'pm' && h < 12) h += 12;
  if (ampm === 'am' && h === 12) h = 0;
  return new Date(`${fecha}T${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:00${OFFSET_CDMX}`);
}

function fechaLegible(fecha) {
  return fecha ? new Date(`${fecha}T12:00:00${OFFSET_CDMX}`).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Mexico_City' }).replace(',', '') : '';
}

// "Clase gratis: Pan de Muerto" -> "Pan de Muerto"
function temaDe(contenido) {
  return String(contenido.clasegratis_titulo || 'la masterclass').replace(/^\s*(clase gratis|master\s*class|masterclass)\s*[:\-–]\s*/i, '').trim();
}

function urlCompleta(url) {
  if (!url) return '';
  return /^https?:\/\//.test(url) ? url : `${SITE_URL}${url}`;
}

function contexto(contenido = store.getContent()) {
  const email = require('./email');
  const horarios = String(contenido.clasegratis_horarios || '').split(',').map((h) => h.trim()).filter(Boolean);
  const cupo = store.cupoClaseGratisPorHorario();
  const tel = String(contenido.whatsapp_numero || '').replace(/\D/g, '').slice(-10);
  return {
    contenido,
    tema: temaDe(contenido),
    arteUrl: urlCompleta(contenido.clasegratis_arte),
    ubicacion: contenido.clasegratis_ubicacion || '',
    lugares: horarios.length && cupo ? horarios.length * cupo : 0,
    precioAcceso: acceso.precioAcceso(contenido),
    linkClase: contenido.clasegratis_link_clase || '',
    linkGrabacion: contenido.clasegratis_link_grabacion || '',
    taller: String(contenido.clasegratis_taller_oferta || '').trim(),
    fechasNativitas: String(contenido.clasegratis_taller_fechas_nativitas || '').trim(),
    fechasDivision: String(contenido.clasegratis_taller_fechas_division || '').trim(),
    tel,
    pie: email.pieEndulcora(email.datosPie(contenido)),
    email,
  };
}

function pesos(n) {
  return `$${Number(n || 0).toLocaleString('es-MX', { maximumFractionDigits: 2 })}`;
}

function linkWhatsTaller(c) {
  const texto = `Hola, estuve en la masterclass de ${c.tema} y quiero apartar mi lugar en el taller${c.taller ? ` de ${c.taller}` : ''} con el precio especial.`;
  return c.tel ? `https://wa.me/521${c.tel}?text=${encodeURIComponent(texto)}` : '';
}

function avisoSucursal() {
  return '<p style="font-size:13px;line-height:1.6;background:#fff4df;border:1px solid #f5c66b;border-radius:12px;padding:10px 12px;">La inscripción se hace en la sucursal. <strong>Para que se aplique el precio especial, muestra este correo o tu ficha</strong> al inscribirte. Aplica para un solo taller por persona.</p>';
}

function hola(registro) {
  return `<p>Hola${registro.nombre ? ` ${esc(registro.nombre)}` : ''}:</p>`;
}

function correo1(registro, c, { accesoAbierto } = {}) {
  const incluye = '<ul style="margin:6px 0 0;padding-left:20px;"><li>Lugar asegurado</li><li>Recetario digital</li><li>Coffee break</li><li>La grabación de la clase</li><li>Un mes gratis de la membresía Club Endulcora</li></ul>';
  const grupo = c.contenido.clasegratis_whatsapp_grupo
    ? `<p style="font-size:14px;">Únete al grupo de WhatsApp de la clase para recibir avisos: <a href="${esc(c.contenido.clasegratis_whatsapp_grupo)}" style="color:#7A2E7E;">unirme al grupo</a>.</p>`
    : '';
  const cuerpo = `${hola(registro)}
    <p>Quedaste registrado(a) en la masterclass <strong>${esc(c.tema)}</strong>, el <strong>${esc(fechaLegible(registro.fecha))} a las ${esc(registro.horario)}</strong>.</p>
    ${c.ubicacion ? `<p style="font-size:14px;">📍 ${esc(c.ubicacion)}</p>` : ''}
    <p>Los lugares presenciales son pocos${c.lugares ? `: solo entran ${c.lugares} personas` : ''}. Si quieres asegurar el tuyo, el <strong>acceso anticipado cuesta ${pesos(c.precioAcceso)}</strong> e incluye:</p>
    ${incluye}
    ${accesoAbierto
      ? c.email.botonPlan('Asegurar mi lugar', acceso.linkAcceso(SITE_URL, registro))
      : '<p>En unos días te mandamos tu link para asegurarlo.</p>'}
    ${grupo}
    <p>Nos vemos pronto,<br><strong>Endulcora</strong></p>`;
  return { asunto: `Ya tienes tu lugar en la masterclass de ${c.tema}`, html: c.email.plantillaPlan({ arteUrl: c.arteUrl, cuerpo, pie: c.pie, preheader: `${fechaLegible(registro.fecha)} a las ${registro.horario}` }) };
}

function correo2(registro, c, { accesoAbierto } = {}) {
  const pagado = registro.accesoEstado === 'pagado';
  let extra = '';
  if (pagado && registro.numeroInscrito) {
    extra = `<p>Tu ficha es la <strong>N.º ${esc(registro.numeroInscrito)}</strong>. Muéstrala al llegar: es tu pase de entrada y de coffee break.</p>`;
  } else if (pagado) {
    extra = '<p>Tu acceso es en línea: una hora antes te mandamos el link para entrar.</p>';
  } else if (accesoAbierto) {
    extra = `<p>Si todavía no aseguras tu lugar, quedan pocos accesos anticipados.</p>${c.email.botonPlan(`Asegurar mi lugar por ${pesos(c.precioAcceso)}`, acceso.linkAcceso(SITE_URL, registro))}`;
  }
  const cuerpo = `${hola(registro)}
    <p>Te esperamos mañana <strong>${esc(fechaLegible(registro.fecha))} a las ${esc(registro.horario)}</strong>${c.ubicacion ? ` en ${esc(c.ubicacion)}` : ''}. Ten a la mano libreta y pluma: vas a querer anotar.</p>
    ${extra}`;
  return { asunto: `Mañana es la masterclass de ${c.tema}`, html: c.email.plantillaPlan({ arteUrl: c.arteUrl, cuerpo, pie: c.pie }) };
}

function correo3(registro, c) {
  const ficha = registro.accesoEstado === 'pagado' && registro.numeroInscrito
    ? `<p>Si vienes a la sucursal, te esperamos con tu ficha <strong>N.º ${esc(registro.numeroInscrito)}</strong>${c.ubicacion ? ` en ${esc(c.ubicacion)}` : ''}.</p>`
    : '';
  const cuerpo = `${hola(registro)}
    <p>En una hora empieza <strong>${esc(c.tema)}</strong>.${c.linkClase ? ' Entra aquí:' : ''}</p>
    ${c.linkClase ? c.email.botonPlan('Entrar a la clase', esc(c.linkClase)) : (c.ubicacion ? `<p>Te esperamos en ${esc(c.ubicacion)}.</p>` : '')}
    ${ficha}`;
  return { asunto: 'En 1 hora empezamos', html: c.email.plantillaPlan({ arteUrl: c.arteUrl, cuerpo, pie: c.pie }) };
}

function correo4(registro, c) {
  const oferta = c.taller
    ? `<p>Si quieres hacerlo con tus manos y con el chef a tu lado, tienes el <strong>taller de ${esc(c.taller)} con un precio especial</strong>, solo para quienes estuvieron en la masterclass. <strong>Vence en 3 días.</strong></p>
      ${avisoSucursal()}
      ${linkWhatsTaller(c) ? c.email.botonPlan('Quiero mi lugar en el taller', linkWhatsTaller(c), '#4E1454', '#FBF4E9') : ''}`
    : '';
  const cuerpo = `${hola(registro)}
    <p>Gracias por estar en la masterclass. Aquí tienes la grabación:</p>
    ${c.email.botonPlan('Ver la grabación', esc(c.linkGrabacion))}
    ${oferta}`;
  return { asunto: 'Tu grabación y un precio solo para ti', html: c.email.plantillaPlan({ arteUrl: c.arteUrl, cuerpo, pie: c.pie }) };
}

function fechasTaller(c) {
  if (!c.fechasNativitas && !c.fechasDivision) return '';
  return `<p style="margin-bottom:4px;">Fechas disponibles:</p><ul style="margin:0;padding-left:20px;">
    ${c.fechasNativitas ? `<li>Nativitas: ${esc(c.fechasNativitas)}</li>` : ''}
    ${c.fechasDivision ? `<li>División del Norte: ${esc(c.fechasDivision)}</li>` : ''}</ul>`;
}

function correo5(registro, c) {
  const cuerpo = `${hola(registro)}
    <p>Mañana se acaba el precio especial del taller de <strong>${esc(c.taller)}</strong>. Después vuelve a su precio normal.</p>
    ${fechasTaller(c)}
    ${avisoSucursal()}
    ${linkWhatsTaller(c) ? c.email.botonPlan('Quiero mi lugar', linkWhatsTaller(c)) : ''}`;
  return { asunto: 'Tu precio especial vence mañana', html: c.email.plantillaPlan({ arteUrl: c.arteUrl, cuerpo, pie: c.pie }) };
}

function correo6(registro, c) {
  const cuerpo = `${hola(registro)}
    <p>Hoy es el último día para tomar el taller de <strong>${esc(c.taller)}</strong> con el precio especial de la masterclass.</p>
    ${fechasTaller(c)}
    ${avisoSucursal()}
    ${linkWhatsTaller(c) ? c.email.botonPlan('Quiero mi lugar', linkWhatsTaller(c)) : ''}`;
  return { asunto: 'Últimas horas del precio especial', html: c.email.plantillaPlan({ arteUrl: c.arteUrl, cuerpo, pie: c.pie }) };
}

const CORREOS = {
  1: { titulo: 'Confirmación de registro', armar: correo1 },
  2: { titulo: 'Recordatorio un día antes', armar: correo2 },
  3: { titulo: 'Empezamos en 1 hora', armar: correo3 },
  4: { titulo: 'Grabación y oferta del taller', armar: correo4 },
  5: { titulo: 'El precio especial vence mañana', armar: correo5 },
  6: { titulo: 'Último aviso', armar: correo6 },
};

// Cuando le toca a un registro cada correo (2 a 6).
function ventanas(registro, contenido = store.getContent()) {
  const inicio = horaInicio(registro.fecha, registro.horario);
  if (!inicio) return {};
  const duracion = Math.max(0.5, Number(contenido.clasegratis_duracion_horas) || 2);
  const fin = new Date(inicio.getTime() + duracion * HORA_MS);
  return {
    2: [enCDMX(registro.fecha, -1, '10:00'), new Date(inicio.getTime() - 2 * HORA_MS)],
    3: [new Date(inicio.getTime() - HORA_MS), new Date(inicio.getTime() + 15 * 60 * 1000)],
    4: [new Date(fin.getTime() + 2 * HORA_MS), enCDMX(registro.fecha, 4, '00:00')],
    5: [enCDMX(registro.fecha, 2, '10:00'), enCDMX(registro.fecha, 3, '00:00')],
    6: [enCDMX(registro.fecha, 3, '10:00'), enCDMX(registro.fecha, 4, '00:00')],
  };
}

function contactoDeBaja(correo) {
  const c = store.getContactosCampana().find((x) => x.email === String(correo || '').toLowerCase());
  return !!(c && c.activo === false);
}

// Correo 1, al registrarse.
async function mandarConfirmacionRegistro(registro, contenido = store.getContent()) {
  const c = contexto(contenido);
  const { asunto, html } = correo1(registro, c, { accesoAbierto: acceso.accesoAbierto(contenido) });
  await c.email.enviarCorreoHtml({ to: registro.correo, asunto, html });
}

let corriendo = false;
async function revisar(ahora = new Date(), { pausaMs = 250 } = {}) {
  if (corriendo) return { enviados: 0 };
  corriendo = true;
  let enviados = 0;
  try {
    const contenido = store.getContent();
    if (contenido.masterclass_correos_activo === 'false') return { enviados };
    const desde = contenido.masterclass_correos_desde || hoyCDMX(ahora);
    const c = contexto(contenido);
    const abierto = acceso.accesoAbierto(contenido, ahora);
    const registros = store.getRegistrosClaseGratis().filter((r) => r.fecha && r.fecha >= desde && r.correo);
    for (const registro of registros) {
      const v = ventanas(registro, contenido);
      for (const n of [2, 3, 4, 5, 6]) {
        const campo = `mc${n}Enviado`;
        if (registro[campo] || !v[n]) continue;
        const [desdeHora, hastaHora] = v[n];
        if (ahora < desdeHora || ahora >= hastaHora) continue;
        if (n === 4 && !c.linkGrabacion) continue; // espera a que se suba la grabacion
        if ((n === 5 || n === 6) && !c.taller) continue;
        if (n >= 4 && contactoDeBaja(registro.correo)) {
          store.updateRegistroClaseGratis(registro.id, { [campo]: 'omitido-baja' });
          continue;
        }
        try {
          const actual = store.getRegistroClaseGratis(registro.id) || registro;
          const { asunto, html } = CORREOS[n].armar(actual, c, { accesoAbierto: abierto });
          await c.email.enviarCorreoHtml({ to: registro.correo, asunto, html });
          store.updateRegistroClaseGratis(registro.id, { [campo]: new Date().toISOString() });
          enviados += 1;
          if (pausaMs) await new Promise((r) => setTimeout(r, pausaMs));
        } catch (err) {
          console.error(`[masterclass] No se pudo mandar el correo ${n} a ${registro.correo}:`, err.message);
        }
      }
    }
  } finally {
    corriendo = false;
  }
  return { enviados };
}

// Para /admin: cuantos van de cada correo en la masterclass actual y que
// falta configurar.
function resumen(contenido = store.getContent()) {
  const fecha = contenido.clasegratis_fecha;
  const registros = store.getRegistrosClaseGratis().filter((r) => r.fecha === fecha);
  const conteo = {};
  [2, 3, 4, 5, 6].forEach((n) => { conteo[n] = registros.filter((r) => r[`mc${n}Enviado`] && r[`mc${n}Enviado`] !== 'omitido-baja').length; });
  const faltan = [];
  if (!contenido.clasegratis_arte) faltan.push('el arte');
  if (!contenido.clasegratis_link_clase) faltan.push('el link para entrar a la clase (correo 3)');
  if (!contenido.clasegratis_link_grabacion) faltan.push('el link de la grabación (el correo 4 espera a que lo pongas)');
  if (!String(contenido.clasegratis_taller_oferta || '').trim()) faltan.push('el taller con precio especial (sin él no salen los correos 5 y 6)');
  return {
    activo: contenido.masterclass_correos_activo !== 'false',
    desde: contenido.masterclass_correos_desde,
    fecha,
    registrados: registros.length,
    conteo,
    faltan,
    aplica: !!fecha && fecha >= (contenido.masterclass_correos_desde || ''),
  };
}

// Vista previa / prueba con un registro de ejemplo.
function ejemplo(n, contenido = store.getContent()) {
  const c = contexto(contenido);
  const horario = String(contenido.clasegratis_horarios || '11:00 am').split(',')[0].trim() || '11:00 am';
  const registro = { id: 0, confirmToken: 'ejemplo', nombre: 'Laura', fecha: contenido.clasegratis_fecha || hoyCDMX(), horario, accesoEstado: n === 3 ? 'pagado' : '', numeroInscrito: n === 3 ? 23 : null };
  if (!c.linkGrabacion) c.linkGrabacion = '#';
  if (!c.taller) c.taller = 'Pan de Muerto Gourmet';
  return CORREOS[n].armar(registro, c, { accesoAbierto: true });
}

function iniciarCorreosMasterclass() {
  setTimeout(() => revisar().catch(() => {}), 3 * 60 * 1000);
  setInterval(() => revisar().catch(() => {}), 5 * 60 * 1000);
}

module.exports = { CORREOS, horaInicio, ventanas, revisar, resumen, ejemplo, mandarConfirmacionRegistro, iniciarCorreosMasterclass, temaDe };
