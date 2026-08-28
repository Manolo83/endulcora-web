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
  if (b.dataset.t === 'inicio') cargarTablero();
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
  pintarEstadoFirma();
  $('#fechaTaller').value = new Date().toISOString().slice(0, 10);

  await cargarTablero();
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
  const listo = Boolean($('#tallerElegido').value.trim()) && PERSONAS.length > 0
    && SESION.plantillaLista && SESION.firmaLista;
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


// ---------- firma del chef ----------
// Es la unica pieza que la app no trae de fabrica, asi que se avisa fuerte
// mientras falte y no se deja enviar nada.
function pintarEstadoFirma() {
  const falta = !SESION.firmaLista;
  $('#avisoFirma').classList.toggle('oculto', !falta);
  $('#estadoFirma').innerHTML = falta
    ? '<span class="et mal">falta</span>'
    : '<span class="et ok">puesta</span>';
  revisarListo();
}

$('#btnFirma').addEventListener('click', async () => {
  const f = $('#archivoFirma').files[0];
  if (!f) return aviso('#avisoFirmaSubir', 'Primero elige la imagen de la firma.', 'mal');
  const fd = new FormData(); fd.append('archivo', f);
  try {
    await api('/api/firma', { metodo: 'POST', form: fd });
    SESION.firmaLista = true;
    pintarEstadoFirma();
    aviso('#avisoFirmaSubir', 'Firma puesta. Ya se pueden enviar reconocimientos.', 'ok');
    $('#previaFirma').innerHTML =
      `<img class="previa" src="/api/vista-previa?nombre=Nombre%20de%20ejemplo&taller=Taller%20de%20ejemplo&t=${Date.now()}" alt="Vista previa con la firma">`;
  } catch (e) { aviso('#avisoFirmaSubir', e.message, 'mal'); }
});

// ---------- tablero de inicio ----------
async function cargarTablero() {
  try {
    const r = await api('/api/resumen');
    $('#numeros').innerHTML = [
      [r.contactos.toLocaleString('es-MX'), 'clientas en la base'],
      [r.reconocimientosEnviados.toLocaleString('es-MX'), 'reconocimientos enviados'],
      [r.talleresDados, 'talleres con envío'],
      [r.folioSiguiente, 'siguiente folio'],
    ].map(([n, t]) => `<div class="num-caja"><b>${n}</b><span>${t}</span></div>`).join('');

    if (!r.ultimos.length) {
      $('#ultimosEnvios').innerHTML = `<p class="chico">Todavía no hay envíos. Ve a <strong>Generar y enviar</strong> para hacer el primero.</p>`;
    } else {
      $('#ultimosEnvios').innerHTML = r.ultimos.map((e) => {
        const f = new Date(e.creado).toLocaleDateString('es-MX', { day: 'numeric', month: 'long' });
        return `<div style="border-bottom:1px solid var(--linea);padding:10px 0">
          <strong>${e.taller}</strong>
          <span class="et ${e.fallidos ? 'mal' : 'ok'}">${e.enviados} enviados${e.fallidos ? ` · ${e.fallidos} fallaron` : ''}</span>
          <div class="chico">${f} · ${e.quien}</div></div>`;
      }).join('');
    }
  } catch (e) {
    $('#numeros').innerHTML = `<div class="aviso mal">${e.message}</div>`;
  }
}

let tiempoRapido;
$('#buscaRapida').addEventListener('input', () => {
  clearTimeout(tiempoRapido);
  tiempoRapido = setTimeout(async () => {
    const q = $('#buscaRapida').value.trim();
    if (q.length < 2) { $('#resultadoRapido').innerHTML = ''; return; }
    const r = await api(`/api/contactos?buscar=${encodeURIComponent(q)}`);
    if (!r.resultados.length) { $('#resultadoRapido').innerHTML = `<p class="chico">Nadie con ese nombre.</p>`; return; }
    $('#resultadoRapido').innerHTML = `<table><tbody>` + r.resultados.slice(0, 8).map((c) =>
      `<tr class="clic" data-id="${c.id}"><td>${c.nombre}</td><td class="chico">${c.email}</td></tr>`
    ).join('') + `</tbody></table>`;
    $('#resultadoRapido').querySelectorAll('tr').forEach((t) =>
      t.addEventListener('click', () => abrirFicha(t.dataset.id)));
  }, 250);
});

// ---------- ficha de cliente ----------
async function abrirFicha(idContacto) {
  $('#capaFicha').classList.remove('oculto');
  $('#fichaCuerpo').innerHTML = `<p class="chico">Cargando…</p>`;
  try {
    const { contacto, historial } = await api(`/api/contactos/${idContacto}`);
    $('#fichaNombre').textContent = contacto.nombre;

    const enviados = historial.filter((h) => h.estado === 'enviado');
    const talleres = [...new Set(enviados.map((h) => h.taller))];

    let hist = '';
    if (!historial.length) {
      hist = `<p class="chico">Todavía no se le ha enviado nada.</p>`;
    } else {
      hist = `<table><thead><tr><th>Taller</th><th>Folio</th><th>Cuándo</th></tr></thead><tbody>` +
        historial.map((h) => {
          const f = new Date(h.enviado).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
          return `<tr><td>${h.taller}<br><span class="et ${h.estado === 'enviado' ? 'ok' : 'mal'}">${h.estado}</span></td>
            <td class="chico">${h.folio || '—'}</td>
            <td class="chico">${f}<br>${h.quien}</td></tr>`;
        }).join('') + `</tbody></table>`;
    }

    $('#fichaCuerpo').innerHTML = `
      <div class="tarjeta">
        <label>Nombre completo</label>
        <input type="text" id="fNombre" value="${escapar(contacto.nombre)}">
        <div class="fila" style="margin-top:12px">
          <div><label>Correo</label><input type="email" id="fEmail" value="${escapar(contacto.email)}"></div>
          <div><label>WhatsApp</label><input type="text" id="fTel" value="${escapar(contacto.telefono || '')}"></div>
        </div>
        <label style="margin-top:12px">Notas</label>
        <textarea id="fNotas" style="min-height:80px" placeholder="Lo que quieras recordar de esta clienta…">${escapar(contacto.notas || '')}</textarea>
        <div style="display:flex;gap:10px;margin-top:12px;align-items:center">
          <button class="btn" id="btnGuardarFicha">Guardar cambios</button>
          <button class="btn-lin" id="btnBorrarFicha">Borrar</button>
        </div>
        <div id="avisoFicha"></div>
      </div>
      <div class="tarjeta">
        <h3 style="margin:0 0 4px;font-size:15px">Historial</h3>
        <p class="chico" style="margin:0 0 12px">
          ${enviados.length} reconocimiento${enviados.length === 1 ? '' : 's'}
          ${talleres.length ? ` · ${talleres.length} taller${talleres.length === 1 ? '' : 'es'}` : ''}
        </p>
        ${hist}
      </div>`;

    $('#btnGuardarFicha').addEventListener('click', async () => {
      try {
        await api(`/api/contactos/${idContacto}`, {
          metodo: 'PUT',
          cuerpo: {
            nombre: $('#fNombre').value, email: $('#fEmail').value,
            telefono: $('#fTel').value, notas: $('#fNotas').value,
          },
        });
        aviso('#avisoFicha', 'Guardado.', 'ok');
        $('#fichaNombre').textContent = $('#fNombre').value;
        buscarContactos();
      } catch (e) { aviso('#avisoFicha', e.message, 'mal'); }
    });

    $('#btnBorrarFicha').addEventListener('click', async () => {
      if (!confirm(`¿Borrar a ${contacto.nombre} de la base? Su historial de envíos no se borra.`)) return;
      await api(`/api/contactos/${idContacto}`, { metodo: 'DELETE' });
      cerrarFicha();
      buscarContactos();
      cargarTablero();
    });
  } catch (e) {
    $('#fichaCuerpo').innerHTML = `<div class="aviso mal">${e.message}</div>`;
  }
}

function cerrarFicha() { $('#capaFicha').classList.add('oculto'); }
$('#btnCerrarFicha').addEventListener('click', cerrarFicha);
$('#capaFicha').addEventListener('click', (e) => { if (e.target.id === 'capaFicha') cerrarFicha(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrarFicha(); });

// Evita que un nombre con comillas rompa el HTML de la ficha.
function escapar(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
    r.resultados.map((c) =>
      `<tr class="clic" data-id="${c.id}"><td>${c.nombre}</td><td class="chico">${c.email}</td><td class="chico">${c.telefono || '—'}</td></tr>`
    ).join('') + `</tbody></table>`;
  $('#tablaContactos').querySelectorAll('tr[data-id]').forEach((t) =>
    t.addEventListener('click', () => abrirFicha(t.dataset.id)));
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
