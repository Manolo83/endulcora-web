// Pantalla de la app de reconocimientos. Todo el estado vive aqui; el servidor
// solo guarda y envia.

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

let TALLERES = [];
let PERSONAS = [];      // lista ya revisada, lista para enviar
let CONTACTOS = [];     // cache de la base, para emparejar por nombre
let SESION = {};

// ---------- utilidades ----------
async function api(ruta, opciones = {}) {
  const r = await fetch(ruta, {
    headers: opciones.cuerpo ? { 'Content-Type': 'application/json' } : undefined,
    method: opciones.metodo || 'GET',
    body: opciones.cuerpo ? JSON.stringify(opciones.cuerpo) : opciones.form,
  });
  const tipo = r.headers.get('content-type') || '';
  const datos = tipo.includes('json') ? await r.json() : await r.text();
  if (!r.ok) throw new Error((datos && datos.error) || 'Algo salió mal.');
  return datos;
}

function aviso(donde, texto, clase = 'ok') {
  $(donde).innerHTML = `<div class="aviso ${clase}">${texto}</div>`;
}

function sinAcentos(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

// ---------- entrar ----------
$('#btnEntrar').addEventListener('click', async () => {
  try {
    await api('/api/entrar', { metodo: 'POST', cuerpo: { clave: $('#clave').value, quien: $('#quien').value } });
    await arrancar();
  } catch (e) {
    $('#errorEntrar').textContent = e.message;
    $('#errorEntrar').classList.remove('oculto');
  }
});
$('#clave').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#btnEntrar').click(); });

$('#btnSalir').addEventListener('click', async () => {
  await api('/api/salir', { metodo: 'POST' });
  location.reload();
});

// ---------- pestanas ----------
$$('nav button').forEach((b) => b.addEventListener('click', () => {
  $$('nav button').forEach((x) => x.classList.remove('activa'));
  b.classList.add('activa');
  $$('main section').forEach((s) => s.classList.add('oculto'));
  $(`#tab-${b.dataset.t}`).classList.remove('oculto');
  if (b.dataset.t === 'historial') cargarHistorial();
  if (b.dataset.t === 'contactos') buscarContactos();
}));

// ---------- arranque ----------
async function arrancar() {
  SESION = await api('/api/sesion');
  if (!SESION.dentro) return;
  $('#pantallaEntrar').classList.add('oculto');
  $('#app').classList.remove('oculto');
  $('#etQuien').textContent = SESION.quien;
  $('#folioActual').textContent = `Siguiente folio: ${SESION.folioSiguiente}`;
  if (!SESION.plantillaLista) $('#avisoPlantilla').classList.remove('oculto');
  $('#fechaTaller').value = new Date().toISOString().slice(0, 10);

  TALLERES = await api('/api/talleres');
  pintarVinetas('');
  const c = await api('/api/contactos');
  CONTACTOS = c.resultados;
  $('#totalContactos').textContent = `(${c.total} personas)`;
}

// ---------- paso 1: vinetas de talleres ----------
function pintarVinetas(filtro) {
  const f = sinAcentos(filtro);
  const lista = f ? TALLERES.filter((t) => sinAcentos(t.nombre).includes(f)) : TALLERES;
  const caja = $('#vinetasTaller');
  if (!lista.length) {
    caja.innerHTML = `<p class="chico">Ningún taller con ese nombre. Puedes escribirlo a mano abajo.</p>`;
    return;
  }
  caja.innerHTML = lista.slice(0, 60).map((t) =>
    `<button class="vineta" data-n="${t.nombre.replace(/"/g, '&quot;')}"><span class="punto"></span>${t.nombre}</button>`
  ).join('');
  caja.querySelectorAll('.vineta').forEach((v) => v.addEventListener('click', () => {
    caja.querySelectorAll('.vineta').forEach((x) => x.classList.remove('sel'));
    v.classList.add('sel');
    $('#tallerElegido').value = v.dataset.n;
    revisarListo();
  }));
}
$('#buscaTaller').addEventListener('input', (e) => pintarVinetas(e.target.value));
$('#tallerElegido').addEventListener('input', revisarListo);

// ---------- paso 2: revisar la lista de personas ----------
$('#btnRevisar').addEventListener('click', () => {
  const renglones = $('#listaPersonas').value.split('\n').map((r) => r.trim()).filter(Boolean);
  PERSONAS = [];
  const problemas = [];

  for (const renglon of renglones) {
    // Se acepta "Nombre, correo" o solo "Nombre" (se busca en la base).
    const partes = renglon.split(',').map((p) => p.trim());
    let nombre = partes[0];
    let email = partes.slice(1).find((p) => p.includes('@')) || '';

    if (!email) {
      const hallado = CONTACTOS.find((c) => sinAcentos(c.nombre) === sinAcentos(nombre));
      if (hallado) email = hallado.email;
    }
    if (!nombre) continue;
    if (!email) {
      problemas.push(`<strong>${nombre}</strong> — no encontré su correo. Escríbelo después de una coma.`);
      continue;
    }
    if (!/^[^@\s]+@[^@\s]+\.[a-zA-Z]{2,}$/.test(email)) {
      problemas.push(`<strong>${nombre}</strong> — el correo <em>${email}</em> no se ve bien escrito.`);
      continue;
    }
    PERSONAS.push({ nombre, email });
  }

  let html = '';
  if (PERSONAS.length) {
    html += `<div class="aviso ok">Listas para enviar: <strong>${PERSONAS.length}</strong></div>
      <table><thead><tr><th>Nombre</th><th>Correo</th></tr></thead><tbody>` +
      PERSONAS.map((p) => `<tr><td>${p.nombre}</td><td class="chico">${p.email}</td></tr>`).join('') +
      `</tbody></table>`;
  }
  if (problemas.length) {
    html += `<div class="aviso mal"><strong>Revisa ${problemas.length}:</strong><br>${problemas.join('<br>')}</div>`;
  }
  if (!PERSONAS.length && !problemas.length) {
    html = `<div class="aviso info">Todavía no escribes a nadie.</div>`;
  }
  $('#resultadoRevision').innerHTML = html;
  revisarListo();
  if (PERSONAS.length) pintarVistaPrevia();
});

// ---------- paso 3: vista previa y envio ----------
function revisarListo() {
  const listo = Boolean($('#tallerElegido').value.trim()) && PERSONAS.length > 0 && SESION.plantillaLista;
  $('#btnEnviar').disabled = !listo;
  $('#btnEnviar').textContent = PERSONAS.length
    ? `Enviar ${PERSONAS.length} reconocimiento${PERSONAS.length > 1 ? 's' : ''}`
    : 'Enviar reconocimientos';
}

function pintarVistaPrevia() {
  const taller = $('#tallerElegido').value.trim();
  if (!taller || !PERSONAS.length || !SESION.plantillaLista) return;
  const p = PERSONAS[0];
  const url = `/api/vista-previa?nombre=${encodeURIComponent(p.nombre)}` +
              `&taller=${encodeURIComponent(taller)}&fecha=${encodeURIComponent($('#fechaTaller').value)}&t=${Date.now()}`;
  $('#cajaPrevia').innerHTML = `<img class="previa" src="${url}" alt="Vista previa del reconocimiento de ${p.nombre}">`;
}
$('#fechaTaller').addEventListener('change', pintarVistaPrevia);
$('#tallerElegido').addEventListener('change', pintarVistaPrevia);

$('#btnEnviar').addEventListener('click', async () => {
  const taller = $('#tallerElegido').value.trim();
  if (!confirm(`Se van a enviar ${PERSONAS.length} reconocimientos del taller de ${taller}. ¿Continuamos?`)) return;

  $('#btnEnviar').disabled = true;
  $('#barra').classList.remove('oculto');
  $('#barra').querySelector('i').style.width = '15%';
  aviso('#avisoEnvio', `Enviando ${PERSONAS.length} reconocimientos… no cierres esta ventana.`, 'info');

  try {
    const envio = await api('/api/enviar', {
      metodo: 'POST',
      cuerpo: { taller, fecha: $('#fechaTaller').value, participantes: PERSONAS },
    });
    $('#barra').querySelector('i').style.width = '100%';
    const fallidos = envio.resultados.filter((r) => r.estado !== 'enviado');
    let html = `<div class="aviso ok"><strong>${envio.enviados} enviados</strong>` +
               (envio.fallidos ? ` · ${envio.fallidos} fallaron` : ' · sin fallas') + `</div>`;
    if (fallidos.length) {
      html += `<div class="aviso mal">No salieron:<br>` +
        fallidos.map((f) => `${f.nombre} (${f.email}) — ${f.error || ''}`).join('<br>') + `</div>`;
    }
    $('#avisoEnvio').innerHTML = html;
    SESION = await api('/api/sesion');
    $('#folioActual').textContent = `Siguiente folio: ${SESION.folioSiguiente}`;
  } catch (e) {
    aviso('#avisoEnvio', e.message, 'mal');
  } finally {
    $('#btnEnviar').disabled = false;
  }
});

// ---------- historial ----------
async function cargarHistorial() {
  try {
    const lista = await api('/api/historial');
    if (!lista.length) { $('#listaHistorial').innerHTML = `<p class="chico">Todavía no hay envíos.</p>`; return; }
    $('#listaHistorial').innerHTML = lista.map((e) => {
      const fecha = new Date(e.creado).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
      const folios = e.resultados.map((r) => r.folio).filter(Boolean);
      const rango = folios.length ? `folios ${Math.min(...folios)}–${Math.max(...folios)}` : '';
      return `<div style="border-bottom:1px solid var(--linea);padding:12px 0">
        <strong>${e.taller}</strong>
        <span class="et ${e.fallidos ? 'mal' : 'ok'}">${e.enviados} enviados${e.fallidos ? ` · ${e.fallidos} fallaron` : ''}</span>
        <div class="chico">${fecha} · lo mandó ${e.quien} · ${rango}</div>
      </div>`;
    }).join('');
  } catch (e) {
    $('#listaHistorial').innerHTML = `<div class="aviso mal">${e.message}</div>`;
  }
}

// ---------- contactos ----------
$('#btnAgregarContacto').addEventListener('click', async () => {
  try {
    await api('/api/contactos', {
      metodo: 'POST',
      cuerpo: { nombre: $('#nContacto').value, email: $('#eContacto').value, telefono: $('#tContacto').value },
    });
    aviso('#avisoContacto', 'Contacto agregado.', 'ok');
    $('#nContacto').value = $('#eContacto').value = $('#tContacto').value = '';
    buscarContactos();
  } catch (e) {
    aviso('#avisoContacto', e.message, 'mal');
  }
});

let tiempoBusqueda;
$('#buscaContacto').addEventListener('input', () => {
  clearTimeout(tiempoBusqueda);
  tiempoBusqueda = setTimeout(buscarContactos, 250);
});

async function buscarContactos() {
  const q = $('#buscaContacto').value.trim();
  const r = await api(`/api/contactos?buscar=${encodeURIComponent(q)}`);
  CONTACTOS = r.resultados;
  $('#totalContactos').textContent = `(${r.total} personas)`;
  if (!r.resultados.length) { $('#tablaContactos').innerHTML = `<p class="chico">Sin resultados.</p>`; return; }
  $('#tablaContactos').innerHTML =
    `<table><thead><tr><th>Nombre</th><th>Correo</th><th>WhatsApp</th></tr></thead><tbody>` +
    r.resultados.map((c) => `<tr><td>${c.nombre}</td><td class="chico">${c.email}</td><td class="chico">${c.telefono || '—'}</td></tr>`).join('') +
    `</tbody></table>`;
}

// ---------- ajustes ----------
$('#btnPlantilla').addEventListener('click', async () => {
  const f = $('#archivoPlantilla').files[0];
  if (!f) return aviso('#avisoPlantillaSubir', 'Primero elige el archivo PNG.', 'mal');
  const fd = new FormData(); fd.append('archivo', f);
  try {
    await api('/api/plantilla', { metodo: 'POST', form: fd });
    aviso('#avisoPlantillaSubir', 'Plantilla lista. Ya puedes generar reconocimientos.', 'ok');
    SESION.plantillaLista = true;
    $('#avisoPlantilla').classList.add('oculto');
    revisarListo();
  } catch (e) { aviso('#avisoPlantillaSubir', e.message, 'mal'); }
});

$('#btnCSV').addEventListener('click', async () => {
  const f = $('#archivoCSV').files[0];
  if (!f) return aviso('#avisoCSV', 'Primero elige el archivo CSV.', 'mal');
  const fd = new FormData(); fd.append('archivo', f);
  aviso('#avisoCSV', 'Leyendo el archivo…', 'info');
  try {
    const r = await api('/api/contactos/importar', { metodo: 'POST', form: fd });
    const s = r.resumen;
    aviso('#avisoCSV', `
      <strong>${r.nuevos} contactos nuevos</strong> y ${r.actualizados} actualizados.<br>
      Se leyeron ${s.filasLeidas} renglones y quedaron ${s.personasUnicas} personas únicas
      (${s.repetidos} eran repetidas).<br>
      ${s.sinCorreo} sin correo · ${s.correoInvalido} con correo mal escrito ·
      ${s.porRevisar} conviene revisarlas a mano.`, 'ok');
    buscarContactos();
  } catch (e) { aviso('#avisoCSV', e.message, 'mal'); }
});

arrancar();
