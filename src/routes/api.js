const express = require('express');
const path = require('path');
const fs = require('fs');
const store = require('../store');
const { UPLOAD_DIR, GOOGLE_ADS, SITE_URL } = require('../config');
const { requireCliente } = require('./auth');
const { uploadImage, uploadMedia, procesarImagenSubida, ALLOWED_VIDEO } = require('../uploads');
const { enviarCorreoConfirmacionInscripcionTaller, enviarCorreoConfirmacionClaseGratis, linkAgregarCalendario } = require('../email');
const { sincronizarInscripcionTaller } = require('../automatizacionesTaller');
const acceso = require('../accesoAnticipado');
const promoBuenFin = require('../promoBuenFin');

const router = express.Router();

// Valida el pais/estado que mandan los formularios de registro (clase
// gratis, video en vivo, talleres): si dice ser de Mexico, el estado tiene
// que ser uno de los 32 validos. Regresa null si todo esta bien, o un
// mensaje de error para responder al cliente.
function errorZonaInvalida(b) {
  if (b.esDeMexico && !store.ESTADOS_MEXICO.includes(b.estado)) {
    return 'Elige tu estado de la lista.';
  }
  if (b.esDeMexico === false && !String(b.pais || '').trim()) {
    return 'Escribe de qué país te registras.';
  }
  return null;
}

// El sitio pregunta aqui que etiquetas de medicion debe cargar, para no tener
// que tocar el HTML cada vez que cambia un ID. Si GOOGLE_ADS_ID esta vacio, el
// sitio simplemente no carga nada de Google.
router.get('/medicion', (req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json({
    googleAdsId: GOOGLE_ADS.medicionId,
    conversionCompra: GOOGLE_ADS.conversionCompra,
  });
});

router.get('/announcements', (req, res) => {
  res.json(store.getAnnouncements(true));
});

router.get('/media', (req, res) => {
  res.json(store.getMedia().filter((m) => m.estado === 'aprobado'));
});

// Foto que sube un cliente para la galeria (queda pendiente de aprobar).
router.post('/galeria/subir', requireCliente, uploadImage.single('file'), procesarImagenSubida, (req, res) => {
  const user = store.getUserById(req.session.userId);
  if (!user) return res.status(401).json({ error: 'Tienes que iniciar sesión.' });
  if (!req.file) return res.status(400).json({ error: 'Sube una foto.' });
  const item = store.addMediaCliente({
    userId: user.id,
    nombreAutor: user.nombre,
    url: `/uploads/${req.file.filename}`,
    filename: req.file.filename,
    title: (req.body && req.body.titulo) || '',
  });
  res.status(201).json(item);
});

router.get('/galeria/:id/comentarios', (req, res) => {
  const item = store.getMedia().find((m) => m.id === Number(req.params.id));
  if (!item) return res.status(404).json({ error: 'No se encontró esa foto.' });
  res.json(store.getComentariosGaleria(req.params.id));
});

router.post('/galeria/:id/comentarios', requireCliente, (req, res) => {
  const item = store.getMedia().find((m) => m.id === Number(req.params.id));
  if (!item) return res.status(404).json({ error: 'No se encontró esa foto.' });
  const user = store.getUserById(req.session.userId);
  if (!user) return res.status(401).json({ error: 'Tienes que iniciar sesión.' });
  const texto = String((req.body && req.body.texto) || '').trim();
  if (!texto) return res.status(400).json({ error: 'Escribe un comentario.' });
  if (texto.length > 1000) return res.status(400).json({ error: 'Tu comentario es muy largo (máximo 1000 caracteres).' });
  const comentario = store.addComentarioGaleria({
    mediaId: item.id,
    userId: user.id,
    nombre: user.nombre,
    texto,
    fotoAutor: user.fotoPerfilUrl || '',
  });
  res.status(201).json(comentario);
});

router.get('/content', (req, res) => {
  const contenido = store.getContent();
  // El link para entrar a la clase en vivo y el recetario de regalo solo se
  // mandan tal cual cuando NO hay cobro activo (clases gratis, como hasta
  // ahora). Con el cobro encendido se quitan de aqui — se revelan solo a
  // quien ya pago, desde GET /api/clase-en-vivo — para que nadie se los
  // salte pidiendo esta ruta publica directamente.
  // El recetario de la clase en vivo ya nunca se manda por aqui: es
  // exclusivo para miembros (o se gana con el mes de regalo del live).
  if (contenido.clase_cobro_activo === 'true') {
    res.json({ ...contenido, clase_url: '', clase_recetario_url: '', clase_recetario_nombre: '', clase_youtube_id: '' });
  } else {
    res.json({ ...contenido, clase_recetario_url: '', clase_recetario_nombre: '' });
  }
});

// Cookies de largo plazo (no la sesion de 12h que usa el login) para el
// registro UNICO a la clase en vivo: una vez que alguien llena el
// formulario y confirma que se unio a la comunidad, no se le vuelve a
// pedir en su navegador — ni ese dia, ni en sesiones futuras.
const DOS_ANIOS_MS = 2 * 365 * 24 * 60 * 60 * 1000;
const COOKIE_OPTS_LARGO_PLAZO = {
  maxAge: DOS_ANIOS_MS,
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
};
function leerCookie(req, nombre) {
  const header = req.headers.cookie || '';
  for (const parte of header.split(';')) {
    const i = parte.indexOf('=');
    if (i === -1) continue;
    if (parte.slice(0, i).trim() === nombre) return decodeURIComponent(parte.slice(i + 1).trim());
  }
  return null;
}

// Regresa si quien hace la peticion tiene acceso a la sesion de clase en
// vivo que toca ahora (gratis, o pagada), y la fecha que la identifica —
// la misma logica que usan /clase-en-vivo y el chat en vivo. Cuando la
// clase no tiene cobro, el acceso ya no es automatico para cualquiera:
// hay que ser miembro activo, o haber completado el registro UNICO (ver
// cookies ev_registrado/ev_comunidad mas arriba).
function accesoClaseEnVivoDeRequest(req) {
  const contenido = store.getContent();
  const requierePago = contenido.clase_cobro_activo === 'true';
  const fecha = store.proximaFechaClaseEnVivo(contenido.clase_dia_semana, contenido.clase_hora, contenido.clase_fecha_especifica);
  const sesionChat = store.claveSesionClaseEnVivo(contenido.clase_youtube_id, fecha);
  const usuario = req.session && req.session.userId ? store.getUserById(req.session.userId) : null;
  if (requierePago) {
    const acceso = !!(usuario && store.tieneAccesoClaseEnVivo({ fecha, userId: usuario.id }));
    return { acceso, fecha, sesionChat };
  }
  const esMiembroActivo = !!(usuario && usuario.membresiaEstado === 'activa');
  const registroCompleto = leerCookie(req, 'ev_registrado') === '1' && leerCookie(req, 'ev_comunidad') === '1';
  // Compatibilidad con quien ya tenia acceso concedido por el sistema
  // anterior (sesion de 12h amarrada a la fecha de hoy, de antes del
  // registro unico): no se le debe cortar el acceso a medio live solo
  // porque su navegador no alcanzo a pasar por el nuevo flujo de 2 pasos.
  const accesoSesionVieja = req.session && req.session.accesoVideoEnVivoFecha === fecha;
  return { acceso: esMiembroActivo || registroCompleto || accesoSesionVieja, fecha, sesionChat };
}

// ---- Clase en vivo: cobro opcional por sesion ----
router.get('/clase-en-vivo', (req, res) => {
  const contenido = store.getContent();
  const requierePago = contenido.clase_cobro_activo === 'true';
  const fecha = store.proximaFechaClaseEnVivo(contenido.clase_dia_semana, contenido.clase_hora, contenido.clase_fecha_especifica);
  if (!requierePago) {
    const usuario = req.session && req.session.userId ? store.getUserById(req.session.userId) : null;
    const esMiembroActivo = !!(usuario && usuario.membresiaEstado === 'activa');
    const registrado = leerCookie(req, 'ev_registrado') === '1';
    const comunidadConfirmada = leerCookie(req, 'ev_comunidad') === '1';
    // Compatibilidad con quien ya tenia acceso concedido por el sistema
    // anterior (ver accesoClaseEnVivoDeRequest arriba) — no se le debe
    // cortar el acceso a medio live.
    const accesoSesionVieja = req.session && req.session.accesoVideoEnVivoFecha === fecha;
    const tieneAcceso = esMiembroActivo || (registrado && comunidadConfirmada) || accesoSesionVieja;
    return res.json({
      requierePago: false,
      requiereRegistro: !esMiembroActivo && !registrado && !accesoSesionVieja,
      requiereComunidad: !esMiembroActivo && registrado && !comunidadConfirmada && !accesoSesionVieja,
      hayVideo: !!contenido.clase_youtube_id || /^https?:\/\//i.test(contenido.clase_url || ''),
      tieneAcceso,
      url: tieneAcceso ? (contenido.clase_url || '') : '',
      youtubeId: tieneAcceso ? (contenido.clase_youtube_id || '') : '',
      // El PDF ya no se expone aqui: el recetario solo se descarga desde
      // /membresia (miembros activos). A quien no es miembro, el boton del
      // live le ofrece el mes de regalo.
      recetarioDisponible: tieneAcceso && !!contenido.clase_recetario_url,
      temas: store.TEMAS_CLASE_GRATIS,
      comunidadLink: contenido.comunidad_whatsapp_link || '',
    });
  }
  const usuario = req.session && req.session.userId ? store.getUserById(req.session.userId) : null;
  const esMiembroActivo = !!(usuario && usuario.membresiaEstado === 'activa');
  const tieneAcceso = !!(usuario && store.tieneAccesoClaseEnVivo({ fecha, userId: usuario.id }));
  res.json({
    requierePago: true,
    precioNormal: contenido.clase_precio_normal,
    precioMiembro: contenido.clase_precio_miembro,
    esMiembroActivo,
    tieneAcceso,
    url: tieneAcceso ? (contenido.clase_url || '') : '',
    youtubeId: tieneAcceso ? (contenido.clase_youtube_id || '') : '',
    recetarioDisponible: tieneAcceso && !!contenido.clase_recetario_url,
  });
});

// Paso 1 del registro unico para entrar a la clase en vivo cuando no hay
// cobro activo (alternativa extra, junto a pago/membresia — no las
// reemplaza). Guarda el registro para control/campañas y deja la cookie
// "ev_registrado" — falta el paso 2 (confirmar-comunidad) para tener
// acceso de verdad.
router.post('/clase-en-vivo/registro', (req, res) => {
  const contenido = store.getContent();
  if (contenido.clase_cobro_activo === 'true') {
    return res.status(400).json({ error: 'Esta clase no usa registro gratuito en este momento.' });
  }
  const fecha = store.proximaFechaClaseEnVivo(contenido.clase_dia_semana, contenido.clase_hora, contenido.clase_fecha_especifica);
  const b = req.body || {};
  const nombre = String(b.nombre || '').trim();
  const whatsapp = String(b.whatsapp || '').trim();
  const correo = String(b.correo || '').trim();

  if (!nombre) return res.status(400).json({ error: 'Escribe tu nombre completo.' });
  if (!WHATSAPP_RE.test(whatsapp)) return res.status(400).json({ error: 'Escribe un número de WhatsApp válido.' });
  if (!EMAIL_RE.test(correo)) return res.status(400).json({ error: 'Escribe un correo válido.' });
  if (typeof b.yaTomoTaller !== 'boolean') return res.status(400).json({ error: 'Dinos si ya tomaste un taller con nosotros.' });
  const errorZona = errorZonaInvalida(b);
  if (errorZona) return res.status(400).json({ error: errorZona });
  if (!b.aceptaAvisoPrivacidad) return res.status(400).json({ error: 'Tienes que aceptar el aviso de privacidad para registrarte.' });

  store.addRegistroVideoEnVivo({
    nombre,
    whatsapp,
    correo,
    fecha,
    yaTomoTaller: b.yaTomoTaller,
    interesTemas: Array.isArray(b.interesTemas) ? b.interesTemas : [],
    esDeMexico: b.esDeMexico,
    estado: b.estado,
    pais: b.pais,
    aceptaAvisoPrivacidad: b.aceptaAvisoPrivacidad,
  });

  res.cookie('ev_registrado', '1', COOKIE_OPTS_LARGO_PLAZO);
  res.status(201).json({
    ok: true,
    requiereComunidad: true,
    comunidadLink: contenido.comunidad_whatsapp_link || '',
  });
});

// Paso 2: confirma que ya se unio a la Comunidad Endulcora. Requiere haber
// pasado por el paso 1 (cookie ev_registrado). El correo es opcional —
// solo sirve para marcar el registro correspondiente en el reporte; el
// acceso se concede igual aunque no llegue (ej. alguien que vuelve en otra
// visita ya con ev_registrado pero sin el correo a la mano en el navegador).
router.post('/clase-en-vivo/confirmar-comunidad', (req, res) => {
  if (leerCookie(req, 'ev_registrado') !== '1') {
    return res.status(400).json({ error: 'Primero completa el registro.' });
  }
  const correo = String((req.body && req.body.correo) || '').trim().toLowerCase();
  if (correo) store.confirmarComunidadVideoEnVivo(correo);

  res.cookie('ev_comunidad', '1', COOKIE_OPTS_LARGO_PLAZO);
  const contenido = store.getContent();
  res.json({
    ok: true,
    url: contenido.clase_url || '',
    youtubeId: contenido.clase_youtube_id || '',
    recetarioDisponible: !!contenido.clase_recetario_url,
  });
});

// ---- Chat en vivo de la clase (solo para quien tiene acceso a esa sesion) ----
router.get('/clase-en-vivo/chat', (req, res) => {
  const { acceso, sesionChat } = accesoClaseEnVivoDeRequest(req);
  if (!acceso) return res.status(403).json({ error: 'Necesitas acceso a esta clase para ver el chat.' });
  res.json(store.getChatClaseEnVivo(sesionChat));
});

router.post('/clase-en-vivo/chat', requireCliente, (req, res) => {
  const { acceso, sesionChat } = accesoClaseEnVivoDeRequest(req);
  if (!acceso) return res.status(403).json({ error: 'Necesitas acceso a esta clase para participar en el chat.' });
  const texto = String((req.body && req.body.texto) || '').trim();
  if (!texto) return res.status(400).json({ error: 'Escribe un mensaje.' });
  if (texto.length > 500) return res.status(400).json({ error: 'Tu mensaje es muy largo.' });
  const usuario = store.getUserById(req.session.userId);
  if (!usuario) return res.status(401).json({ error: 'Tienes que iniciar sesión.' });
  const item = store.addMensajeChatClaseEnVivo({ fecha: sesionChat, userId: usuario.id, nombre: usuario.nombre, texto });
  res.status(201).json(item);
});

// ---- Cuantas personas estan viendo la clase en vivo ahora mismo ----
// Mientras alguien tiene el video abierto, su pagina manda "sigo aqui" cada
// rato con un id propio de esa pestaña. Aqui solo se cuentan los que
// mandaron señal hace poco (se borran los que ya se fueron), y no se guarda
// en el store porque es informacion que solo importa mientras dura la
// sesion en vivo.
const PRESENCIA_CLASE_TIMEOUT_MS = 45 * 1000;
const presenciaClaseEnVivo = new Map(); // sesionChat -> Map(id de pestaña -> ultima señal)

function contarPresenciaClaseEnVivo(fecha) {
  const vistos = presenciaClaseEnVivo.get(fecha);
  if (!vistos) return 0;
  const ahora = Date.now();
  for (const [id, ultimaVez] of vistos) {
    if (ahora - ultimaVez > PRESENCIA_CLASE_TIMEOUT_MS) vistos.delete(id);
  }
  return vistos.size;
}

router.post('/clase-en-vivo/presencia', (req, res) => {
  const { acceso, sesionChat } = accesoClaseEnVivoDeRequest(req);
  if (!acceso) return res.status(403).json({ error: 'Necesitas acceso a esta clase.' });
  const id = String((req.body && req.body.id) || '').trim().slice(0, 100);
  if (id) {
    if (!presenciaClaseEnVivo.has(sesionChat)) presenciaClaseEnVivo.set(sesionChat, new Map());
    presenciaClaseEnVivo.get(sesionChat).set(id, Date.now());
  }
  res.json({ conectados: contarPresenciaClaseEnVivo(sesionChat) });
});

// ---- Blog de recetas gratuitas ----
const PREFIJO_BLOG_POR_CATEGORIA = { ebook: 'ebooks', anexo: 'anexos', recetario: 'recetarios' };
function conProductoRelacionado(post) {
  if (!post.productoRelacionadoId) return { ...post, productoRelacionado: null };
  const producto = store.getProduct(post.productoRelacionadoId);
  if (!producto || producto.ocultoEnCatalogo) return { ...post, productoRelacionado: null };
  return {
    ...post,
    productoRelacionado: {
      titulo: producto.titulo,
      slug: producto.slug,
      prefijo: PREFIJO_BLOG_POR_CATEGORIA[producto.categoria] || 'ebooks',
    },
  };
}

router.get('/blog', (req, res) => {
  res.json(store.getBlogPosts(true).map(conProductoRelacionado));
});

router.get('/blog/:slug', (req, res) => {
  const post = store.getBlogPostBySlug(req.params.slug);
  if (!post || !post.publicado) return res.status(404).json({ error: 'No se encontró esa entrada.' });
  res.json(conProductoRelacionado(post));
});

router.get('/products', (req, res) => {
  res.json(store.getProducts());
});

// Apartados del catalogo de eBooks (/ebooks-<slug>), para el mosaico y el
// filtrado publico en /categoria.html.
router.get('/apartados-ebooks', (req, res) => {
  res.json(store.getApartadosEbooks());
});

router.get('/cursos', (req, res) => {
  res.json(store.getCursos());
});

const PREFIJO_POR_CATEGORIA = { ebook: 'ebooks', anexo: 'anexos', recetario: 'recetarios' };

function resumenProducto(r) {
  return {
    id: r.id,
    slug: r.slug,
    categoria: r.categoria,
    prefijo: PREFIJO_POR_CATEGORIA[r.categoria] || 'ebooks',
    titulo: r.titulo,
    descripcionCorta: r.descripcionCorta,
    precio: r.precio,
    precioMembresia: r.precioMembresia || '',
    imagen: r.imagen,
    esPaquete: !!r.esPaquete,
    boton: r.boton || '',
  };
}

router.get('/productos/:slug', (req, res) => {
  const producto = store.getProductBySlug(req.params.slug);
  if (!producto) return res.status(404).json({ error: 'No encontrado' });
  const relacionados = (producto.productosRelacionados || [])
    .map((id) => store.getProduct(id))
    .filter(Boolean)
    .map(resumenProducto);
  // Paquetes que incluyen este producto como componente, aunque el paquete
  // no lo tenga ligado desde este lado (se liga una sola vez, del paquete al componente).
  const paquetesQueLoIncluyen = store.getProducts()
    .filter((x) => x.esPaquete && x.id !== producto.id && (x.productosRelacionados || []).includes(producto.id))
    .map(resumenProducto);
  res.json({ ...producto, productosRelacionadosInfo: relacionados, paquetesQueLoIncluyen });
});

router.get('/hero-carrusel', (req, res) => {
  res.json(store.getHeroCarrusel());
});

router.get('/sedes', (req, res) => {
  res.json(store.getSedes());
});

router.get('/sesiones-taller', (req, res) => {
  res.json(store.getSesionesTaller(req.query.sedeId));
});

// Pagina publica de un taller por slug (/talleres/<slug>): trae tambien el
// nombre, direccion y link de mapa de su sede, para no hacer dos pedidos.
router.get('/talleres/:slug', (req, res) => {
  const sesion = store.getSesionTallerPorSlug(req.params.slug);
  if (!sesion) return res.status(404).json({ error: 'Ese taller ya no está disponible.' });
  const sede = store.getSedes().find((s) => s.id === sesion.sedeId);

  // Otras fechas del MISMO taller (mismo titulo y sede) — varios talleres
  // se anuncian con "jueves o sabado" en una sola imagen, pero cada fecha
  // es su propia pagina/sesion; sin esto, la mitad de quien le da clic al
  // anuncio cae en la fecha que no queria y no tiene forma de cambiarse sin
  // preguntar por WhatsApp. Se ofrecen las que todavia sirven para comprar
  // (no agotadas, no ya pasadas).
  const hoyISO = new Date().toISOString().slice(0, 10);
  const otrasFechas = store.getSesionesTaller(sede ? sede.id : undefined)
    .filter((s) => s.id !== sesion.id && s.titulo === sesion.titulo
      && s.fecha >= hoyISO && s.estado !== 'agotado' && s.cupoRestante !== 0)
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .map((s) => ({ slug: s.slug, fecha: s.fecha, horario: s.horario, cupoRestante: s.cupoRestante }));

  // Un solo link de venta por taller, sin importar cuantas fechas tenga: el
  // anuncio siempre manda al slug de la fecha MAS TEMPRANA (el "canonico").
  // Si alguien entra por el slug de otra fecha (un link viejo, o uno que no
  // se actualizo), la pagina lo manda sola al canonico en vez de abrir una
  // segunda pagina de venta para el mismo taller.
  const canonicalSlug = [sesion, ...otrasFechas].sort((a, b) => a.fecha.localeCompare(b.fecha))[0].slug;

  res.json({
    ...sesion,
    sede: sede ? { id: sede.id, nombre: sede.nombre, direccion: sede.direccion, mapaLink: sede.mapaLink } : null,
    otrasFechas,
    canonicalSlug,
  });
});

router.get('/resenas', (req, res) => {
  res.json(store.getResenas(true));
});

router.get('/comunidad/publicaciones', (req, res) => {
  res.json(store.getPublicacionesComunidad().filter((p) => p.estado === 'aprobado'));
});

// Publicacion hecha por un cliente (foto o video + descripcion, como una
// red social): queda pendiente de aprobar, no se agrega al feed publico.
router.post('/comunidad/publicaciones', requireCliente, uploadMedia.single('archivo'), procesarImagenSubida, (req, res) => {
  const user = store.getUserById(req.session.userId);
  if (!user) return res.status(401).json({ error: 'Tienes que iniciar sesión.' });
  const texto = String((req.body && req.body.texto) || '').trim();
  if (!req.file) return res.status(400).json({ error: 'Sube una foto o un video.' });
  if (texto.length > 1000) return res.status(400).json({ error: 'Tu descripción es muy larga (máximo 1000 caracteres).' });

  const esVideo = ALLOWED_VIDEO.includes(req.file.mimetype);
  const item = store.addPublicacionComunidadCliente({
    userId: user.id,
    nombreAutor: user.nombre,
    fotoAutor: user.fotoPerfilUrl || '',
    texto,
    imagen: esVideo ? '' : `/uploads/${req.file.filename}`,
    imagenNombre: esVideo ? null : req.file.filename,
    video: esVideo ? `/uploads/${req.file.filename}` : '',
    videoNombre: esVideo ? req.file.filename : '',
  });
  res.status(201).json(item);
});

router.get('/comunidad/publicaciones/:id/mensajes', (req, res) => {
  const publicacion = store.getPublicacionComunidad(req.params.id);
  if (!publicacion) return res.status(404).json({ error: 'Publicación no encontrada.' });
  res.json(store.getMensajesComunidad(req.params.id));
});

router.post('/comunidad/publicaciones/:id/mensajes', requireCliente, uploadImage.single('imagen'), procesarImagenSubida, (req, res) => {
  const publicacion = store.getPublicacionComunidad(req.params.id);
  if (!publicacion) return res.status(404).json({ error: 'Publicación no encontrada.' });
  const user = store.getUserById(req.session.userId);
  if (!user) return res.status(401).json({ error: 'Tienes que iniciar sesión.' });
  const texto = String((req.body && req.body.texto) || '').trim();
  if (!texto && !req.file) return res.status(400).json({ error: 'Escribe un comentario o adjunta una foto.' });
  if (texto.length > 1000) return res.status(400).json({ error: 'Tu comentario es muy largo (máximo 1000 caracteres).' });
  const item = store.addMensajeComunidad({
    publicacionId: publicacion.id,
    userId: user.id,
    nombre: user.nombre,
    texto,
    imagen: req.file ? `/uploads/${req.file.filename}` : '',
    imagenNombre: req.file ? req.file.filename : '',
    fotoAutor: user.fotoPerfilUrl || '',
  });
  res.status(201).json(item);
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
router.post('/newsletter/suscribir', (req, res) => {
  const correo = String((req.body && req.body.email) || '').trim();
  if (!EMAIL_RE.test(correo)) return res.status(400).json({ error: 'Escribe un correo válido.' });
  // Por ahora solo se guarda en la lista: el envio de correos (receta de
  // regalo, secuencia hacia la membresia) esta pausado a peticion del dueño
  // del sitio — ver src/automatizaciones.js para reactivarlo.
  store.addSubscriber(correo);
  res.status(201).json({ ok: true });
});

// Formulario publico de inscripcion a talleres (replicable en cualquier
// pagina de campaña): guarda el registro completo para control interno y
// alimenta la base de datos general de Levent con los campos de contacto.
//
// El taller, la fecha, la sede y el horario NUNCA se toman de lo que escribe
// quien llena el formulario — siempre se resuelven en el servidor a partir
// de una sesion real del calendario (sesionTallerId), para que: (1) nadie
// pueda inventar una fecha o un taller que no existe, y (2) "Paella",
// "paella" y "PAELLA" nunca se registren como talleres distintos, porque el
// texto lo escribe una sola vez el equipo de Endulcora al armar el
// calendario, no cada persona que se inscribe.
const WHATSAPP_RE = /^[0-9+\s()-]{7,20}$/;
router.post('/inscripcion-taller', async (req, res) => {
  const b = req.body || {};
  const nombre = String(b.nombre || '').trim();
  const whatsapp = String(b.whatsapp || '').trim();
  const correo = String(b.correo || '').trim();
  const sesionTallerId = Number(b.sesionTallerId);

  if (!nombre) return res.status(400).json({ error: 'Escribe tu nombre completo.' });
  if (!WHATSAPP_RE.test(whatsapp)) return res.status(400).json({ error: 'Escribe un número de WhatsApp válido.' });
  if (!EMAIL_RE.test(correo)) return res.status(400).json({ error: 'Escribe un correo válido.' });
  if (!sesionTallerId) return res.status(400).json({ error: 'Elige el taller al que te inscribes desde el calendario.' });
  const errorZona = errorZonaInvalida(b);
  if (errorZona) return res.status(400).json({ error: errorZona });
  if (!b.aceptaAvisoPrivacidad) return res.status(400).json({ error: 'Tienes que aceptar el aviso de privacidad para inscribirte.' });

  const sesion = store.getSesionesTaller().find((s) => s.id === sesionTallerId);
  if (!sesion) return res.status(400).json({ error: 'Ese taller ya no está disponible en el calendario. Elige otro.' });
  if (sesion.fecha && sesion.fecha < new Date().toISOString().slice(0, 10)) {
    return res.status(400).json({ error: 'Ese taller ya se realizó.' });
  }
  if (sesion.estado === 'agotado') return res.status(400).json({ error: 'Ese taller ya está agotado. Elige otra fecha o sede.' });
  const sedeInfo = store.getSedes().find((s) => s.id === sesion.sedeId);

  const item = store.addInscripcionTaller({
    nombre,
    whatsapp,
    correo,
    sesionTallerId: sesion.id,
    taller: sesion.titulo,
    fecha: sesion.fecha,
    sede: sedeInfo ? sedeInfo.nombre : '',
    horario: sesion.horario || '',
    montoAnticipo: b.montoAnticipo,
    comoSeEntero: b.comoSeEntero,
    preferencias: b.preferencias,
    cumpleDia: b.cumpleDia,
    cumpleMes: b.cumpleMes,
    esDeMexico: b.esDeMexico,
    estado: b.estado,
    pais: b.pais,
    esPrimeraVez: b.esPrimeraVez,
    aceptaPromociones: b.aceptaPromociones,
    aceptaAvisoPrivacidad: b.aceptaAvisoPrivacidad,
  });

  res.status(201).json({ ok: true, id: item.id });

  // El correo de confirmacion nunca debe tumbar la inscripcion: la persona
  // ya quedo registrada aunque Resend falle o no este configurado. Se manda
  // despues de responder para no retrasar la confirmacion en pantalla.
  const contenido = store.getContent();
  enviarCorreoConfirmacionInscripcionTaller({
    to: item.correo,
    nombre: item.nombre,
    taller: item.taller,
    fecha: item.fecha,
    sede: item.sede,
    horario: item.horario,
    siteUrl: SITE_URL,
    numeroWhatsapp: contenido.whatsapp_numero,
  }).catch((e) => {
    console.error(`[inscripcion-taller] No se pudo mandar el correo de confirmacion a ${item.correo}:`, e.message);
  });

  // Toda inscripcion (pagada o no) se intenta mandar a "Inscritos 2026" de
  // inmediato, para que Lex vea ahi lo mismo que ve en /admin casi en el
  // momento. Si Sheets no esta configurado o falla, no pasa nada grave: el
  // barrido automatico de cada 30 min (ver automatizacionesTaller.js) la
  // vuelve a intentar sola, nunca se pierde.
  sincronizarInscripcionTaller(item).catch((e) => {
    console.error(`[inscripcion-taller] No se pudo sincronizar con Google Sheets la inscripcion ${item.id}:`, e.message);
  });
});

// Formulario corto para el QR de captura (pensado para escanearse desde el
// celular a la mitad de un live en StreamYard): solo nombre, contacto y
// que marca le interesa. Igual que el resto de formularios publicos, la
// base de datos general de Levent solo recibe lo necesario para
// mercadotecnia (ver leventSync.js).
router.post('/registro', (req, res) => {
  const b = req.body || {};
  const nombre = String(b.nombre || '').trim();
  const whatsapp = String(b.whatsapp || '').trim();
  const correo = String(b.correo || '').trim();

  if (!nombre) return res.status(400).json({ error: 'Escribe tu nombre completo.' });
  if (!WHATSAPP_RE.test(whatsapp)) return res.status(400).json({ error: 'Escribe un número de WhatsApp válido.' });
  if (!EMAIL_RE.test(correo)) return res.status(400).json({ error: 'Escribe un correo válido.' });
  if (!b.aceptaAvisoPrivacidad) return res.status(400).json({ error: 'Tienes que aceptar el aviso de privacidad para registrarte.' });

  const item = store.addRegistroQr({
    nombre,
    whatsapp,
    correo,
    marcaInteres: b.marcaInteres,
    aceptaPromociones: b.aceptaPromociones,
    aceptaAvisoPrivacidad: b.aceptaAvisoPrivacidad,
  });
  res.status(201).json({ ok: true, id: item.id });
});

// ---- Clase gratis en sala (p.ej. Pan de Muerto): registro + horarios.
// El "registro vive en el sitio", no en WhatsApp. Los horarios siempre
// estan abiertos, sin tope de cupo.
function horariosClaseGratis(contenido) {
  return String(contenido.clasegratis_horarios || '')
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean)
    .map((horario) => ({ horario }));
}

router.get('/clase-gratis', (req, res) => {
  const contenido = store.getContent();
  const abierto = acceso.registroAbierto(contenido);
  res.json({
    activo: abierto,
    titulo: abierto ? contenido.clasegratis_titulo || '' : '',
    descripcion: contenido.clasegratis_descripcion || '',
    fecha: contenido.clasegratis_fecha || '',
    horarios: horariosClaseGratis(contenido),
    temas: store.TEMAS_CLASE_GRATIS,
    whatsappGrupo: contenido.clasegratis_whatsapp_grupo || '',
    comunidadLink: contenido.comunidad_whatsapp_link || '',
  });
});

router.post('/clase-gratis/registro', (req, res) => {
  const b = req.body || {};
  const contenido = store.getContent();
  if (!acceso.registroAbierto(contenido)) {
    return res.status(400).json({ error: 'El registro para esta clase no está abierto en este momento.' });
  }
  const nombre = String(b.nombre || '').trim();
  const whatsapp = String(b.whatsapp || '').trim();
  const correo = String(b.correo || '').trim();
  const horario = String(b.horario || '').trim();

  if (!nombre) return res.status(400).json({ error: 'Escribe tu nombre completo.' });
  if (!WHATSAPP_RE.test(whatsapp)) return res.status(400).json({ error: 'Escribe un número de WhatsApp válido.' });
  if (!EMAIL_RE.test(correo)) return res.status(400).json({ error: 'Escribe un correo válido.' });
  if (typeof b.yaTomoTaller !== 'boolean') return res.status(400).json({ error: 'Dinos si ya tomaste un taller con nosotros.' });
  const errorZona = errorZonaInvalida(b);
  if (errorZona) return res.status(400).json({ error: errorZona });
  if (!b.aceptaAvisoPrivacidad) return res.status(400).json({ error: 'Tienes que aceptar el aviso de privacidad para registrarte.' });

  const horariosDisponibles = horariosClaseGratis(contenido);
  const elegido = horariosDisponibles.find((h) => h.horario === horario);
  if (!elegido) return res.status(400).json({ error: 'Elige un horario válido.' });

  const item = store.addRegistroClaseGratis({
    nombre,
    whatsapp,
    correo,
    fecha: contenido.clasegratis_fecha,
    horario,
    yaTomoTaller: b.yaTomoTaller,
    interesTemas: Array.isArray(b.interesTemas) ? b.interesTemas : [],
    esDeMexico: b.esDeMexico,
    estado: b.estado,
    pais: b.pais,
    aceptaAvisoPrivacidad: b.aceptaAvisoPrivacidad,
  });
  // Si el acceso anticipado ya esta abierto (el correo masivo ya salio),
  // quien se registra ahora pasa directo a su pagina personal y recibe su
  // correo de acceso anticipado, para no quedarse fuera del embudo.
  const accesoYaAbierto = acceso.accesoAbierto(contenido);
  res.status(201).json({ ok: true, id: item.id, accesoUrl: accesoYaAbierto ? `/acceso-anticipado?id=${item.id}&token=${item.confirmToken}` : '' });
  if (accesoYaAbierto) {
    store.marcarRecordatorioClaseGratisEnviado(item.id, 'correoConfirmarEnviado');
    require('../confirmacionClaseGratis').mandarCorreoAcceso(item, contenido).catch((e) => {
      console.error(`[acceso-anticipado] No se pudo mandar el correo de acceso a ${item.correo}:`, e.message);
    });
  }

  // El correo de confirmacion nunca debe tumbar el registro: la persona ya
  // quedo registrada aunque Resend falle o no este configurado. Se manda
  // despues de responder para no retrasar la confirmacion en pantalla.
  enviarCorreoConfirmacionClaseGratis({
    to: item.correo,
    nombre: item.nombre,
    horario: item.horario,
    fecha: contenido.clasegratis_fecha,
    ubicacion: contenido.clasegratis_ubicacion,
    numeroWhatsapp: contenido.whatsapp_numero,
    linkWhatsappGrupo: contenido.clasegratis_whatsapp_grupo,
  }).catch((e) => {
    console.error(`[clase-gratis] No se pudo mandar el correo de confirmacion a ${item.correo}:`, e.message);
  });
});

// Registra si alguien va o no a la clase gratis (control de aforo, tope de
// 100 por horario, se reinicia por horario -- ver store.responderClaseGratis)
// -- dos formas de llegar aqui:
// 1. Desde el correo personal: trae id+token+respuesta (los botones Sí/No
//    de ese correo).
// 2. Desde el link compartido en el grupo de WhatsApp: trae correo (la
//    persona lo escribe en la pagina publica /confirmar-clase) -- siempre
//    cuenta como "Sí", ya que no tiene botones.
router.post('/clase-gratis/confirmar', (req, res) => {
  const b = req.body || {};
  let registro = null;
  if (b.id && b.token) {
    registro = store.getRegistroClaseGratisPorToken(b.id, b.token);
  } else if (b.correo) {
    registro = store.buscarRegistroClaseGratisActivo(String(b.correo).trim());
  }
  if (!registro) {
    return res.status(404).json({ error: 'No encontramos tu registro. Revisa que el correo sea el mismo con el que te registraste.' });
  }
  const respuesta = b.respuesta === 'no' ? 'no' : 'si';
  // Ya no hay ficha gratis: decir "Sí" lleva al acceso anticipado. Con el
  // link personal (id+token) se le manda directo a su pagina; con el link
  // compartido (solo escribe su correo) se le manda su link por correo, para
  // que nadie entre a la pagina de otra persona.
  if (respuesta === 'si' && registro.fecha === store.getContent().clasegratis_fecha) {
    const contenidoActual = store.getContent();
    if (registro.accesoEstado === 'pagado' || acceso.accesoAbierto(contenidoActual)) {
      if (b.id && b.token) {
        return res.json({ resultado: 'accesoAnticipado', accesoUrl: `/acceso-anticipado?id=${registro.id}&token=${registro.confirmToken}` });
      }
      require('../confirmacionClaseGratis').mandarCorreoAcceso(registro, contenidoActual).catch((e) => {
        console.error(`[acceso-anticipado] No se pudo reenviar el link a ${registro.correo}:`, e.message);
      });
      return res.json({ resultado: 'linkEnviado', nombre: registro.nombre });
    }
    return res.json({ resultado: 'accesoCerrado', nombre: registro.nombre });
  }
  const { item, resultado } = store.responderClaseGratis(registro.id, respuesta);
  const contenido = store.getContent();
  const vaAVenir = resultado === 'confirmado' || resultado === 'yaConfirmado';
  const calendarLink = vaAVenir
    ? linkAgregarCalendario({
        titulo: 'Clase gratis Endulcora — Pan de muerto',
        fecha: item.fecha,
        horario: item.horario,
        ubicacion: contenido.clasegratis_ubicacion,
      })
    : '';
  res.json({
    resultado, // 'confirmado' | 'yaConfirmado' | 'declinado' | 'yaRespondidoNo' | 'cupoLleno'
    nombre: item.nombre,
    horario: item.horario,
    fecha: item.fecha,
    ubicacion: contenido.clasegratis_ubicacion,
    numeroInscrito: item.numeroInscrito,
    calendarLink,
    linkClasesEnVivo: !vaAVenir ? '/clases-en-vivo' : '',
  });
});

// ---- Promocion "El Buen Fin llego antes" (/buen-fin) ----
// Nunca se manda la ruta del PDF: solo lo necesario para mostrar el catalogo.
router.get('/buen-fin', (req, res) => {
  const contenido = store.getContent();
  const c = promoBuenFin.configPromo(contenido);
  const abierta = promoBuenFin.promoAbierta(contenido);
  const apartados = store.getApartadosEbooks();
  const ventas = promoBuenFin.resumenVentas();
  res.json({
    abierta,
    fin: c.fin ? c.fin.toISOString() : null,
    precioUno: c.precioUno,
    precioPaquete: c.precioPaquete,
    whatsapp: contenido.whatsapp_numero || '',
    // Prueba social solo con compras reales, y solo cuando ya son varias.
    compras: ventas.compras >= 5 ? ventas.compras : 0,
    apartados: apartados.map((a) => ({ slug: a.slug, nombre: a.nombre })),
    ebooks: abierta
      ? promoBuenFin.ebooksPromo().map((p) => ({
          id: p.id,
          titulo: p.titulo,
          subtitulo: p.subtitulo || '',
          descripcionCorta: p.descripcionCorta || '',
          imagen: p.imagen || '',
          apartado: p.apartado || '',
          precioNormal: p.precio || '',
          slug: p.slug || '',
        }))
      : [],
  });
});

// ---- Acceso anticipado de la master class (ver src/accesoAnticipado.js) ----
// Pagina personal del link del correo: solo con id + token del registro.
router.get('/acceso-anticipado', (req, res) => {
  const registro = store.getRegistroClaseGratisPorToken(req.query.id, req.query.token);
  if (!registro) return res.status(404).json({ error: 'No encontramos tu registro. Usa el link de tu correo.' });
  const contenido = store.getContent();
  const esClaseActual = registro.fecha === contenido.clasegratis_fecha;
  const { cupo, ocupadas, quedan } = acceso.estadoHorario(registro.fecha, registro.horario);
  const usuario = store.getUserByEmail(registro.correo);
  const sesionUsuario = req.session && req.session.userId ? store.getUserById(req.session.userId) : null;
  const cierre = acceso.fechaCierre(contenido);
  const ahora = new Date();
  const apartadoVigente = registro.accesoEstado === 'apartado' && registro.accesoApartadoHasta && new Date(registro.accesoApartadoHasta) > ahora;
  res.json({
    abierto: esClaseActual && acceso.accesoAbierto(contenido),
    titulo: contenido.clasegratis_titulo || 'Master class',
    nombre: registro.nombre,
    correo: registro.correo,
    fecha: registro.fecha,
    horario: registro.horario,
    ubicacion: contenido.clasegratis_ubicacion || '',
    precio: acceso.precioAcceso(contenido),
    cupo,
    ocupadas,
    quedan,
    cierre: cierre ? cierre.toISOString() : null,
    cuenta: {
      existe: !!usuario,
      sesionActiva: !!(usuario && sesionUsuario && sesionUsuario.id === usuario.id),
      esMiembroActivo: !!(usuario && usuario.membresiaEstado === 'activa'),
      membresiaHasta: usuario && usuario.membresiaOrigen === 'acceso_anticipado' ? usuario.membresiaRegaloHasta : null,
    },
    acceso: {
      estado: registro.accesoEstado === 'apartado' && !apartadoVigente ? '' : registro.accesoEstado,
      tipo: registro.accesoTipo,
      numero: registro.accesoEstado === 'pagado' ? registro.numeroInscrito : null,
      pasoAOnline: !!registro.accesoPasoAOnline,
      apartadoHasta: apartadoVigente ? registro.accesoApartadoHasta : null,
      recetarioDisponible: registro.accesoEstado === 'pagado' && !!registro.accesoRecetarioUrl,
    },
  });
});

// Recetario de la master class: lo pago con su acceso, asi que no depende
// de que su membresia siga activa.
router.get('/acceso-anticipado/recetario', (req, res) => {
  const registro = store.getRegistroClaseGratisPorToken(req.query.id, req.query.token);
  if (!registro || registro.accesoEstado !== 'pagado' || !registro.accesoRecetarioUrl) {
    return res.status(404).send('No encontramos tu recetario.');
  }
  const filename = path.basename(registro.accesoRecetarioUrl);
  const ruta = path.join(UPLOAD_DIR, filename);
  if (!fs.existsSync(ruta)) return res.status(404).send('No pudimos encontrar el recetario en este momento.');
  res.download(ruta, (registro.accesoRecetarioNombre || `Recetario${path.extname(filename)}`).replace(/"/g, ''));
});

// Estado de un pedido para la pagina de gracias: requiere el viewToken que
// Mercado Pago devuelve en la URL (no es adivinable, a diferencia del id).
router.get('/pedidos/:orderId/estado', (req, res) => {
  const order = store.getOrder(req.params.orderId);
  if (!order || !order.viewToken || req.query.token !== order.viewToken) {
    return res.status(404).json({ error: 'Pedido no encontrado.' });
  }
  const aprobado = order.estado === 'aprobado';
  const contenido = store.getContent();
  res.json({
    estado: order.estado,
    total: order.total,
    moneda: 'MXN',
    items: (order.items || []).map((item, i) => {
      const producto = item.tipo === 'producto' ? store.getProduct(item.itemId) : null;
      const archivoExiste = !!(producto && producto.archivo && fs.existsSync(path.join(UPLOAD_DIR, path.basename(producto.archivo))));
      let tallerInfo = null;
      if (item.tipo === 'taller' && item.inscripcionTallerId) {
        const inscripcion = store.getInscripcionTaller(item.inscripcionTallerId);
        const sesion = inscripcion ? store.getSesionesTaller().find((s) => s.id === inscripcion.sesionTallerId) : null;
        const sedeInfo = sesion ? store.getSedes().find((s) => s.id === sesion.sedeId) : null;
        if (inscripcion) {
          tallerInfo = {
            taller: inscripcion.taller,
            fecha: inscripcion.fecha,
            horario: inscripcion.horario,
            sede: inscripcion.sede,
            direccion: sedeInfo ? sedeInfo.direccion : '',
            mapaLink: sedeInfo ? sedeInfo.mapaLink : '',
            queAprendes: sesion ? sesion.queAprendes : '',
            tipoPago: inscripcion.tipoPago,
            saldo: inscripcion.saldo,
            estadoPago: inscripcion.estadoPago,
            vencePendienteEn: inscripcion.vencePendienteEn,
            comunidadLink: contenido.comunidad_whatsapp_link || '',
          };
        }
      }
      return {
        index: i,
        itemId: item.itemId,
        tipo: item.tipo,
        titulo: item.titulo,
        cantidad: item.cantidad,
        precio: item.precio,
        descargaDisponible: aprobado && archivoExiste,
        tallerInfo,
      };
    }),
    descargaToken: aprobado ? order.descargaToken : null,
  });
});

router.get('/pedidos/:orderId/descarga/:itemIndex', (req, res) => {
  const order = store.getOrder(req.params.orderId);
  if (!order || order.estado !== 'aprobado') {
    return res.status(404).send('Pedido no encontrado.');
  }
  if (!order.descargaToken || req.query.token !== order.descargaToken) {
    return res.status(403).send('Enlace no válido.');
  }
  const item = (order.items || [])[Number(req.params.itemIndex)];
  if (!item || item.tipo !== 'producto') {
    return res.status(404).send('Artículo no encontrado.');
  }
  const producto = store.getProduct(item.itemId);
  if (!producto || !producto.archivo) {
    return res.status(404).send('Este artículo todavía no tiene un archivo disponible. Escríbenos por WhatsApp al 5665271901.');
  }
  const filename = path.basename(producto.archivo);
  const rutaCompleta = path.join(UPLOAD_DIR, filename);
  if (!fs.existsSync(rutaCompleta)) {
    console.error(`[descarga] Falta el archivo de "${producto.titulo}" (producto ${producto.id}) en ${rutaCompleta}. Hay que volver a subirlo en /admin.`);
    return res.status(404).send('No pudimos encontrar tu archivo en este momento. Escríbenos por WhatsApp al 5665271901 y te lo mandamos directo.');
  }
  const nombreDescarga = producto.archivoNombre || `${producto.titulo || 'archivo'}${path.extname(filename)}`;
  res.download(rutaCompleta, nombreDescarga, (err) => {
    if (err && !res.headersSent) {
      console.error(`[descarga] Error al enviar el archivo de "${producto.titulo}":`, err.message);
      res.status(500).send('Ocurrió un error al preparar tu descarga. Escríbenos por WhatsApp al 5665271901.');
    }
  });
});

module.exports = router;
