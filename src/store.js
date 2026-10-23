const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');
const { DATA_DIR, UPLOAD_DIR } = require('./config');
const { generarCaratulaPDF } = require('./caratula');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

if (!process.env.DATABASE_URL) {
  throw new Error(
    '[store] Falta la variable DATABASE_URL. Agrega el plugin de PostgreSQL en Railway (New > Database > PostgreSQL); Railway crea esta variable automaticamente.'
  );
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const DEFAULT_CONTENT = {
  hero_badge: 'Ciudad de México · Desde 2024',
  hero_titulo_1: 'Aprende la técnica.',
  hero_titulo_2: 'Cobra lo que vale.',
  hero_parrafo:
    'Manuales técnicos, hojas de costeo listas para usar, aplicaciones de bolsillo y talleres en vivo para reposteros, banqueteros y emprendedores que quieren cocinar bien y vender con margen real.',
  hero_cta_primario: 'Ir a la tienda',
  hero_cta_secundario: 'Ver cursos y talleres',
  hero_stat1_valor: '137',
  hero_stat1_etiqueta: 'Páginas de manual',
  hero_stat2_valor: '50',
  hero_stat2_etiqueta: 'Fórmulas costeadas',
  hero_stat3_valor: '2',
  hero_stat3_etiqueta: 'Anexos en Excel',
  hero_caption: 'se enciende, se derrite, se come',
  hero_caption_sub: 'Receta 01 · Sección gourmet',
  chef_imagen: '',
  asistente_icono: '',
  leadmagnet_titulo: 'Tu receta gratis',
  leadmagnet_descripcion: 'Suscríbete al correo de Endulcora y te mandamos una receta de regalo, más tips y ofertas de vez en cuando.',
  leadmagnet_pdf_url: '',
  leadmagnet_pdf_nombre: '',
  chef_badge: 'Fundador de Endulcora',
  chef_nombre: 'Chef Luis Alfonso Jiménez Cárdenas',
  chef_bio:
    'Formado en cocina profesional y especializado en repostería técnica, Luis Alfonso creó Endulcora para enseñar recetas de estudio con el mismo rigor con el que se costean: al gramo, con margen real y listas para vender. Cada manual y cada clase en vivo nacen de su cocina en Ciudad de México.',
  clase_titulo: 'Vela de mantequilla\ntrufada, paso a paso',
  clase_descripcion:
    'Dos horas por videollamada con el Chef Luis Alfonso: temperatura de la mezcla, montaje del pabilo, desmolde y costeo en vivo de la pieza que armes. Queda grabada.',
  clase_mostrar: 'false',
  clase_dia_semana: '4',
  clase_hora: '19:00',
  // Para transmisiones de fecha suelta (Endulcora en vivo): si se llena,
  // reemplaza el calculo del dia de la semana de arriba.
  clase_fecha_especifica: '',
  clase_cupos_totales: '25',
  clase_cupos_apartados: '0',
  clase_info: '',
  clase_url: '',
  // ID del video de YouTube (transmision en vivo, no listada) para
  // reproducirlo embebido dentro de la pagina en vez de mandar a YouTube o
  // StreamYard. Si esta vacio, se usa clase_url como enlace externo (modo
  // anterior).
  clase_youtube_id: '',
  // Cobro por acceso a la clase en vivo (aparte, no confundir con la
  // membresia): apagado por defecto para que las clases sigan siendo
  // gratis hasta que el admin decida cobrar una en especifico.
  clase_cobro_activo: 'false',
  clase_precio_normal: '300',
  clase_precio_miembro: '150',
  // Recetario de regalo de esta clase (PDF): se entrega a quien tiene
  // acceso a la clase, sea porque es gratis o porque ya pago — misma regla
  // que el link para entrar, nunca se manda por separado.
  clase_recetario_url: '',
  clase_recetario_nombre: '',
  // ---- Clase gratis en sala (p.ej. Pan de Muerto): registro en el sitio +
  // oferta del día. Independiente de la "clase en vivo" (esa es online).
  clasegratis_activo: 'false',
  clasegratis_titulo: 'Clase gratis: Pan de Muerto',
  clasegratis_descripcion: '',
  clasegratis_fecha: '',
  // Horarios separados por coma, ej: "11:00 am, 1:00 pm, 4:00 pm". Siempre
  // estan abiertos, sin tope de cupo.
  clasegratis_horarios: '',
  // Direccion de la sede, para el correo de confirmacion de registro.
  clasegratis_ubicacion: 'Endulcora Nativitas — Av. Antonio Rodríguez 34, Col. San Simón Ticumac, Benito Juárez, CDMX (metro Portales o Nativitas)',
  // Link de invitacion al grupo de WhatsApp de la clase gratis (ej. de
  // https://chat.whatsapp.com/...). Se muestra en el correo de confirmacion
  // y en la pantalla de "ya quedaste registrado". Distinto del WhatsApp
  // general del sitio.
  clasegratis_whatsapp_grupo: 'https://chat.whatsapp.com/JZE84n4ZOB11tHdKwLs7dY',
  // Fecha limite (AAAA-MM-DD) para confirmar el lugar en la clase gratis
  // (control de aforo, ver confirmarRegistroClaseGratis) -- despues de esta
  // fecha, el equipo puede promover a quien este en lista de espera.
  clasegratis_confirmacion_limite: '2026-10-24',
  // Link de invitacion al grupo de WhatsApp "Comunidad Endulcora". Se usa
  // en varios lados: paso obligatorio para ver la clase en vivo sin pagar
  // ni ser miembro (ver registrosVideoEnVivo / POST
  // /api/clase-en-vivo/registro y /confirmar-comunidad), e invitacion
  // opcional en el registro de clase gratis y de talleres.
  comunidad_whatsapp_link: 'https://chat.whatsapp.com/GazcjgRuMje3jm4V9REu2V?s=sw&p=a&mlu=4&ilr=4',
  // Precio/anticipo/cupo con los que se da de alta un taller nuevo cuando
  // se importa de un jalon (a mano desde /admin o solo desde el calendario
  // fisico en Google Sheets, ver src/syncCalendarioTalleres.js) — todos los
  // talleres cuestan lo mismo segun el dueño del sitio. Un taller ya
  // existente nunca se toca aunque esto cambie despues.
  taller_precio_default: '1149',
  taller_anticipo_default: '400',
  taller_cupo_default: '20',
  footer_descripcion:
    'Publicaciones y talleres para quien cocina con oficio y quiere vivir de eso. Ciudad de México, México.',
  whatsapp_numero: '5665271901',
  legal_privacidad:
    'Endulcora · Estudio Gastronómico, con domicilio en Ciudad de México, es responsable del tratamiento de tus datos personales.\n\nQué recabamos. Nombre, correo electrónico y teléfono, y los datos de facturación cuando los solicitas.\n\nPara qué. Entregar tus compras digitales, darte acceso a tus cursos, emitir comprobantes y avisarte de nuevas publicaciones. No vendemos ni compartimos tus datos con terceros ajenos a estos fines.\n\nCon quién los compartimos. Endulcora forma parte del grupo de marcas acompañadas por Levent (junto con Crenef, Instituto Justo, Silman y futuros proyectos del grupo). Tus datos de contacto y de compra pueden compartirse entre estas marcas únicamente para campañas de mercadotecnia, publicidad (como Meta Ads y Google Ads) y análisis interno de mercado — nunca se venden ni se comparten con nadie fuera de este grupo.\n\nTus derechos ARCO. Puedes acceder, rectificar, cancelar u oponerte al uso de tus datos —incluido oponerte específicamente a que se compartan con las demás marcas del grupo— escribiendo a nuestro WhatsApp. Respondemos en un máximo de 20 días hábiles.',
  legal_terminos:
    'La compra de cualquier producto digital de Endulcora otorga una licencia personal e intransferible de uso.\n\nLos precios están en pesos mexicanos. La entrega de eBooks y anexos es inmediata al confirmarse el pago, mediante enlace de descarga a tu correo.\n\nLas clases en vivo se imparten en la fecha publicada; si no puedes asistir, la grabación queda disponible 30 días.',
  legal_reembolso:
    'Por tratarse de productos digitales descargables, no hay devoluciones una vez entregado el archivo.\n\nSi el archivo llega dañado, incompleto o no puedes abrirlo, lo reponemos sin costo. Escríbenos dentro de los 7 días siguientes a tu compra.\n\nEn cursos en vivo puedes cambiar tu fecha hasta 48 horas antes de la sesión.',
  legal_licencia:
    'Puedes usar el contenido para producir y vender tus propios productos, sin límite de piezas.\n\nNo puedes revender, regalar, subir a plataformas de descarga ni reproducir total o parcialmente el manual o las hojas de cálculo.\n\nSi vas a impartir clases con este material, escríbenos: existe una licencia para escuelas y talleres.',
  legal_inocuidad:
    'Las velas comestibles combinan alimento y fuego. Nunca las dejes encendidas sin vigilancia, cerca de niños, corrientes de aire o materiales inflamables.\n\nSe encienden por minutos, con fines sensoriales, y se apagan para consumir la grasa fundida tibia.\n\nVarias fórmulas contienen lácteos, frutos secos, ajonjolí y gluten: declara siempre los alérgenos y respeta la cadena de frío.',
};

const DEFAULT_PRODUCTS = [
  {
    categoria: 'ebook',
    etiqueta: 'VOLUMEN I',
    destacado: 'Más vendido',
    titulo: 'Velas Comestibles',
    subtitulo: 'El arte de derretir sabores',
    descripcionCorta: 'Guía técnica · Recetario · Negocio',
    bullets: [
      '50 fórmulas con maridaje y punto de fusión',
      'Capítulo completo de costeo, merma y precios',
      'Empaque, etiquetado y cadena de frío',
      'PDF de 137 páginas, descarga inmediata',
    ],
    precio: '499',
    precioAnterior: '1,000',
    boton: 'Comprar eBook',
    imagen: '',
  },
  {
    categoria: 'anexo',
    etiqueta: 'HOJA DE CÁLCULO',
    destacado: 'Anexo contable',
    titulo: 'Costos, Merma y Precios',
    subtitulo: '',
    descripcionCorta: 'Hoja 1 · Catálogo de insumos · Hoja 2 · Recetas · Hoja 3 · Costeo y precio',
    bullets: [
      'Costo por gramo automático de cada insumo',
      'Merma repartida con la fórmula correcta',
      'Precio de menudeo y mayoreo por canal',
      'Excel y Google Sheets, sin macros',
    ],
    precio: '249',
    precioAnterior: '',
    boton: 'Comprar anexo',
    imagen: '',
  },
  {
    categoria: 'ebook',
    etiqueta: 'PAQUETE COMPLETO',
    destacado: '',
    titulo: 'Oficios Dulces Vol. I + II',
    subtitulo: '',
    descripcionCorta:
      'Los dos manuales de la colección con sus dos anexos de costeo y la app de bolsillo para calcular precios desde el celular durante la producción.',
    bullets: [
      'Velas Comestibles (137 pp.)',
      'Galletas estilo Nueva York (113 pp.)',
      '2 hojas de costeo + app HTML',
      'Acceso a una clase en vivo de regalo',
    ],
    precio: '1,190',
    precioAnterior: '1,996',
    boton: 'Llevar el paquete',
    imagen: '',
  },
];

const DEFAULT_CURSOS = [
  {
    modalidad: 'En línea · 2 h',
    titulo: 'Velas de mantequilla trufada',
    descripcion: 'Del punto de fusión al montaje del pabilo comestible. Con costeo en vivo de tu pieza.',
    precio: '690',
  },
  {
    modalidad: 'Presencial · 5 h',
    titulo: 'Galletas estilo Nueva York',
    descripcion: 'Masa madurada, relleno y horneado. Sales con producto terminado y ficha técnica.',
    precio: '1,450',
  },
  {
    modalidad: 'En línea · 3 h',
    titulo: 'Costeo para cocinas pequeñas',
    descripcion: 'Arma tu catálogo de insumos, calcula merma real y fija precios por canal de venta.',
    precio: '590',
  },
];

// ---- Persistencia en PostgreSQL ----
// `data` vive en memoria mientras el proceso corre (rapido de leer, igual que
// antes); cada cambio se encola para guardarse en PostgreSQL en orden, sin
// bloquear la respuesta al navegador. init() debe terminar (await) antes de
// que el servidor empiece a aceptar peticiones.
let data = null;
let colaEscritura = Promise.resolve();

const DEFAULT_SEDES = ['Nativitas', 'División del Norte'];

function datosPorDefecto() {
  return {
    announcements: [],
    media: [],
    content: { ...DEFAULT_CONTENT },
    products: DEFAULT_PRODUCTS.map((p, i) => ({ id: i + 1, orden: i, ...p })),
    cursos: DEFAULT_CURSOS.map((c, i) => ({ id: i + 1, orden: i, ...c })),
    orders: [],
    membresiaPagos: [],
    users: [],
    heroCarrusel: [],
    promosTaller: [],
    subscribers: [],
    sedes: DEFAULT_SEDES.map((nombre, i) => ({ id: i + 1, nombre, imagenFondo: '', direccion: '', mapaLink: '' })),
    sesionesTaller: [],
    inscripcionesTaller: [],
    recetariosTaller: [],
    registrosQr: [],
    registrosClaseGratis: [],
    envioConfirmacionClaseGratis: null,
    registrosVideoEnVivo: [],
    bibliotecaClases: [],
    contactosCampana: [],
    campanasCorreo: [],
    resenas: [],
    publicacionesComunidad: [],
    mensajesComunidad: [],
    comentariosGaleria: [],
    blogPosts: [],
    accesosClaseEnVivo: [],
    chatClaseEnVivo: [],
    contenidoMembresia: { recetarioUrl: '', recetarioNombre: '', recetarioMes: '', videoMostrar: false, videoYoutubeId: '', videoTitulo: '', videoMes: '', revistaUrl: '', revistaNombre: '', revistaNumero: '', whatsappGrupoUrl: '' },
  };
}

async function persistirAhora() {
  await pool.query('UPDATE app_data SET data = $1, updated_at = now() WHERE id = 1', [JSON.stringify(data)]);
}

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_data (
      id INT PRIMARY KEY DEFAULT 1,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  const res = await pool.query('SELECT data FROM app_data WHERE id = 1');
  if (res.rows.length) {
    data = res.rows[0].data;
    let changed = false;
    const defaults = datosPorDefecto();
    for (const key of Object.keys(defaults)) {
      if (!data[key]) {
        data[key] = defaults[key];
        changed = true;
      }
    }
    for (const key of Object.keys(DEFAULT_CONTENT)) {
      if (!Object.prototype.hasOwnProperty.call(data.content, key)) {
        data.content[key] = DEFAULT_CONTENT[key];
        changed = true;
      }
    }
    (data.products || []).forEach((p) => {
      if (typeof p.descripcionLarga !== 'string') { p.descripcionLarga = ''; changed = true; }
      if (!Array.isArray(p.galeria)) { p.galeria = []; changed = true; }
      if (!Array.isArray(p.productosRelacionados)) {
        // Migra el campo anterior (solo anexos) al nuevo, mas general (cualquier producto).
        p.productosRelacionados = Array.isArray(p.anexosRelacionados) ? p.anexosRelacionados : [];
        delete p.anexosRelacionados;
        changed = true;
      }
      if (typeof p.esPaquete !== 'boolean') { p.esPaquete = false; changed = true; }
      if (typeof p.ocultoEnCatalogo !== 'boolean') { p.ocultoEnCatalogo = false; changed = true; }
      if (typeof p.precioMembresia !== 'string') {
        // Los paquetes completos ya existentes arrancan con $100 para clientes
        // con membresia activa; los demas productos quedan sin descuento.
        p.precioMembresia = p.esPaquete ? '100' : '';
        changed = true;
      }
      if (!p.slug) {
        p.slug = slugUnico(p.titulo, data.products, p.id);
        changed = true;
      }
    });
    (data.users || []).forEach((u) => {
      if (typeof u.telefono !== 'string') { u.telefono = ''; changed = true; }
      if (typeof u.membresiaEstado !== 'string') { u.membresiaEstado = 'ninguna'; changed = true; }
      if (typeof u.membresiaPreapprovalId !== 'string') { u.membresiaPreapprovalId = ''; changed = true; }
      // Vacio = sin fecha de corte (a los miembros que ya estaban activos
      // antes de este campo no se les oculta nada retroactivamente). De aqui
      // en adelante, cada vez que una membresia pasa a "activa" se guarda la
      // fecha, para que la biblioteca de clases solo muestre grabaciones
      // desde ese momento en adelante ("borron y cuenta nueva" si cancela y
      // se vuelve a suscribir despues).
      if (typeof u.membresiaActivaDesde !== 'string') { u.membresiaActivaDesde = ''; changed = true; }
      if (typeof u.fotoPerfilUrl !== 'string') { u.fotoPerfilUrl = ''; changed = true; }
      if (typeof u.registroRecordatorioEnviado !== 'boolean') { u.registroRecordatorioEnviado = false; changed = true; }
      // Numero de suscriptor: fecha en la que se activo la membresia por
      // primera vez en su historia (no se vuelve a tocar despues, aunque
      // cancele y se vuelva a suscribir). A quien ya tenia membresia antes
      // de este campo se le calcula lo mejor posible con lo que ya existia:
      // su membresiaActivaDesde si la tiene, o la fecha en que creo su
      // cuenta si alguna vez tuvo membresia pero nunca se guardo esa fecha.
      if (typeof u.membresiaPrimeraActivacion !== 'string') {
        if (u.membresiaActivaDesde) {
          u.membresiaPrimeraActivacion = new Date(u.membresiaActivaDesde).toISOString();
        } else if (u.membresiaEstado && u.membresiaEstado !== 'ninguna') {
          u.membresiaPrimeraActivacion = u.createdAt || '';
        } else {
          u.membresiaPrimeraActivacion = '';
        }
        changed = true;
      }
    });
    (data.subscribers || []).forEach((s) => {
      if (typeof s.leadMagnetPaso !== 'number') { s.leadMagnetPaso = 0; changed = true; }
      if (typeof s.leadMagnetProximoEnvio === 'undefined') { s.leadMagnetProximoEnvio = null; changed = true; }
      if (typeof s.unsubToken !== 'string' || !s.unsubToken) { s.unsubToken = crypto.randomUUID(); changed = true; }
    });
    (data.bibliotecaClases || []).forEach((c) => {
      if (typeof c.recetarioUrl !== 'string') { c.recetarioUrl = ''; changed = true; }
      if (typeof c.recetarioNombre !== 'string') { c.recetarioNombre = ''; changed = true; }
    });
    if (typeof data.contenidoMembresia.videoMostrar !== 'boolean') { data.contenidoMembresia.videoMostrar = false; changed = true; }
    if (typeof data.contenidoMembresia.revistaUrl !== 'string') { data.contenidoMembresia.revistaUrl = ''; changed = true; }
    if (typeof data.contenidoMembresia.revistaNombre !== 'string') { data.contenidoMembresia.revistaNombre = ''; changed = true; }
    if (typeof data.contenidoMembresia.revistaNumero !== 'string') { data.contenidoMembresia.revistaNumero = ''; changed = true; }
    if (typeof data.contenidoMembresia.whatsappGrupoUrl !== 'string') { data.contenidoMembresia.whatsappGrupoUrl = ''; changed = true; }
    // El link del grupo de WhatsApp vivio brevemente en el contenido
    // publico (data.content.whatsapp_grupo_miembros_url) antes de moverlo
    // aqui, a contenidoMembresia, que si revisa membresia activa. Si alguien
    // alcanzo a guardarlo ahi, se rescata el valor y se borra ese campo para
    // que no quede expuesto sin querer via /api/content.
    if (data.content && typeof data.content.whatsapp_grupo_miembros_url === 'string') {
      if (!data.contenidoMembresia.whatsappGrupoUrl && data.content.whatsapp_grupo_miembros_url) {
        data.contenidoMembresia.whatsappGrupoUrl = data.content.whatsapp_grupo_miembros_url;
      }
      delete data.content.whatsapp_grupo_miembros_url;
      changed = true;
    }
    // Semilla de la primera revista mensual (solo la primera vez que arranca
    // el servidor despues de este cambio; si ya hay una revista publicada
    // -sea esta u otra que suba el admin despues- no se vuelve a tocar).
    if (!data.contenidoMembresia.revistaUrl) {
      const origenRevista = path.join(__dirname, '..', 'seed-archivos', 'revista-mensual', 'Endulcora_Revista_N01.pdf');
      if (fs.existsSync(origenRevista)) {
        const destino = `${crypto.randomUUID()}.pdf`;
        fs.copyFileSync(origenRevista, path.join(UPLOAD_DIR, destino));
        data.contenidoMembresia.revistaUrl = `/uploads/${destino}`;
        data.contenidoMembresia.revistaNombre = 'Endulcora_Revista_N01.pdf';
        data.contenidoMembresia.revistaNumero = data.contenidoMembresia.revistaNumero || 'N.º 1';
        changed = true;
      }
    }
    // Carga el PDF del eBook de Velas Comestibles (el producto ya existia,
    // con su precio, bullets e imagen reales, pero le faltaba el archivo
    // descargable). Solo corre si el producto sigue sin archivo — no pisa
    // uno que ya se haya subido despues a mano desde /admin.
    {
      const velasEbook = data.products.find((p) => p.slug === 'velas-comestibles');
      if (velasEbook && !velasEbook.archivo) {
        const origen = path.join(__dirname, '..', 'seed-archivos', 'velas-comestibles', 'Endulcora_Velas_Comestibles_eBook.pdf');
        if (fs.existsSync(origen)) {
          const destino = `${crypto.randomUUID()}.pdf`;
          fs.copyFileSync(origen, path.join(UPLOAD_DIR, destino));
          velasEbook.archivo = `/uploads/${destino}`;
          velasEbook.archivoNombre = 'Endulcora_Velas_Comestibles_eBook.pdf';
          changed = true;
        }
      }
    }
    // Arma la familia de Velas Comestibles (Anexo Excel + App + Paquete
    // completo), igual que Tamales/Nogada/etc, pero sin recrear el eBook
    // principal (ese ya existia con su contenido real: precio, bullets,
    // imagen). Los 3 quedan ocultos del catalogo, solo se compran desde la
    // pagina del eBook. Corre una sola vez.
    if (!data._migFamiliaVelasComestibles) {
      const velasEbook = data.products.find((p) => p.slug === 'velas-comestibles');
      if (velasEbook) {
        const SEED_DIR = path.join(__dirname, '..', 'seed-archivos', 'velas-comestibles');
        const nuevoSatelite = (titulo, categoriaItem, precio, boton, nombreArchivo) => {
          const item = {
            id: nextId(data.products),
            orden: data.products.length,
            categoria: categoriaItem,
            etiqueta: '',
            destacado: '',
            titulo,
            subtitulo: '',
            descripcionCorta: '',
            descripcionLarga: '',
            bullets: [],
            precio,
            precioAnterior: '',
            precioMembresia: '',
            boton,
            imagen: '',
            galeria: [],
            archivo: '',
            archivoNombre: '',
            slug: '',
            productosRelacionados: [],
            esPaquete: false,
            ocultoEnCatalogo: true,
          };
          item.slug = slugUnico(titulo, data.products, item.id);
          data.products.push(item);
          if (nombreArchivo) {
            const origen = path.join(SEED_DIR, nombreArchivo);
            if (fs.existsSync(origen)) {
              const destino = `${crypto.randomUUID()}${path.extname(nombreArchivo)}`;
              fs.copyFileSync(origen, path.join(UPLOAD_DIR, destino));
              item.archivo = `/uploads/${destino}`;
              item.archivoNombre = nombreArchivo;
            }
          }
          return item;
        };
        const anexo = nuevoSatelite('Anexo Excel · Velas Comestibles', 'anexo', '50', 'Añadir anexo Excel al carrito', 'Endulcora_Velas_Comestibles_Calculadora_Costos_Merma_Precios.xlsx');
        const app = nuevoSatelite('App · Velas Comestibles', 'ebook', '50', 'Añadir app al carrito', 'Endulcora_Velas_Comestibles_APP.html');
        const paquete = nuevoSatelite('Velas Comestibles · Paquete completo', 'ebook', '149', 'Comprar paquete completo', 'Paquete_Completo.zip');
        paquete.esPaquete = true;
        paquete.precioMembresia = '100';
        velasEbook.productosRelacionados = [anexo.id, app.id, paquete.id];
      }
      data._migFamiliaVelasComestibles = true;
      changed = true;
    }
    // Arma la familia de Roles Gourmet (Anexo Excel + App + Paquete
    // completo), igual que Velas Comestibles: el eBook ya existia con su
    // precio, foto y galeria reales (slug 'roles-gourmet-especial'), solo
    // le faltaba el archivo descargable. Los 3 satelites quedan ocultos del
    // catalogo, solo se compran desde la pagina del eBook. Corre una vez.
    if (!data._migFamiliaRolesGourmet) {
      const rolesEbook = data.products.find((p) => p.slug === 'roles-gourmet-especial');
      if (rolesEbook) {
        const SEED_DIR = path.join(__dirname, '..', 'seed-archivos', 'roles-gourmet');
        const nuevoSatelite = (titulo, categoriaItem, precio, boton, nombreArchivo) => {
          const item = {
            id: nextId(data.products),
            orden: data.products.length,
            categoria: categoriaItem,
            etiqueta: '',
            destacado: '',
            titulo,
            subtitulo: '',
            descripcionCorta: '',
            descripcionLarga: '',
            bullets: [],
            precio,
            precioAnterior: '',
            precioMembresia: '',
            boton,
            imagen: '',
            galeria: [],
            archivo: '',
            archivoNombre: '',
            slug: '',
            productosRelacionados: [],
            esPaquete: false,
            ocultoEnCatalogo: true,
          };
          item.slug = slugUnico(titulo, data.products, item.id);
          data.products.push(item);
          if (nombreArchivo) {
            const origen = path.join(SEED_DIR, nombreArchivo);
            if (fs.existsSync(origen)) {
              const destino = `${crypto.randomUUID()}${path.extname(nombreArchivo)}`;
              fs.copyFileSync(origen, path.join(UPLOAD_DIR, destino));
              item.archivo = `/uploads/${destino}`;
              item.archivoNombre = nombreArchivo;
            }
          }
          return item;
        };
        if (!rolesEbook.archivo) {
          const origenEbook = path.join(SEED_DIR, 'Endulcora_Roles_Gourmet_eBook.pdf');
          if (fs.existsSync(origenEbook)) {
            const destino = `${crypto.randomUUID()}.pdf`;
            fs.copyFileSync(origenEbook, path.join(UPLOAD_DIR, destino));
            rolesEbook.archivo = `/uploads/${destino}`;
            rolesEbook.archivoNombre = 'Endulcora_Roles_Gourmet_eBook.pdf';
          }
        }
        const anexo = nuevoSatelite('Anexo Excel · Roles Gourmet', 'anexo', '50', 'Añadir anexo Excel al carrito', 'Endulcora_Roles_Gourmet_Calculadora_Costos_Merma_Precios.xlsx');
        const app = nuevoSatelite('App · Roles Gourmet', 'ebook', '50', 'Añadir app al carrito', 'Endulcora_Roles_Gourmet_APP.html');
        const paquete = nuevoSatelite('Roles Gourmet · Paquete completo', 'ebook', '149', 'Comprar paquete completo', 'Paquete_Completo.zip');
        paquete.esPaquete = true;
        paquete.precioMembresia = '100';
        rolesEbook.productosRelacionados = [anexo.id, app.id, paquete.id];
      }
      data._migFamiliaRolesGourmet = true;
      changed = true;
    }
    // Campos nuevos para fotos de clientes: reseñas, comunidad y galeria.
    // Todo lo que ya existia (creado por el admin, o ya publicado) se marca
    // 'aprobado' para no desaparecer — solo lo nuevo que suban los clientes
    // empieza en 'pendiente'.
    (data.resenas || []).forEach((r) => {
      if (typeof r.imagen !== 'string') { r.imagen = ''; changed = true; }
      if (typeof r.imagenNombre !== 'string') { r.imagenNombre = ''; changed = true; }
      if (typeof r.fotoAutor !== 'string') { r.fotoAutor = ''; changed = true; }
    });
    (data.publicacionesComunidad || []).forEach((p) => {
      if (typeof p.userId === 'undefined') { p.userId = null; changed = true; }
      if (typeof p.nombreAutor !== 'string') { p.nombreAutor = ''; changed = true; }
      if (typeof p.fotoAutor !== 'string') { p.fotoAutor = ''; changed = true; }
      if (typeof p.video !== 'string') { p.video = ''; changed = true; }
      if (typeof p.videoNombre !== 'string') { p.videoNombre = ''; changed = true; }
      if (typeof p.estado !== 'string') { p.estado = 'aprobado'; changed = true; }
    });
    (data.mensajesComunidad || []).forEach((m) => {
      if (typeof m.imagen !== 'string') { m.imagen = ''; changed = true; }
      if (typeof m.imagenNombre !== 'string') { m.imagenNombre = ''; changed = true; }
      if (typeof m.fotoAutor !== 'string') { m.fotoAutor = ''; changed = true; }
    });
    (data.media || []).forEach((m) => {
      if (typeof m.userId === 'undefined') { m.userId = null; changed = true; }
      if (typeof m.nombreAutor !== 'string') { m.nombreAutor = ''; changed = true; }
      if (typeof m.estado !== 'string') { m.estado = 'aprobado'; changed = true; }
    });
    // Reemplaza un producto "paquete completo" antiguo (un solo articulo)
    // por una familia de 4: eBook (principal, visible en el catalogo) +
    // Anexo Excel + App + Paquete completo (estos 3 ocultos del catalogo,
    // solo se compran desde la pagina del eBook). Precios estandar de la
    // linea de eBooks: eBook $99, Anexo $50, App $50, Paquete $149.
    // Para agregar un producto nuevo a esta lista: sube sus 3 archivos a
    // seed-archivos/<carpetaSeed>/ y agrega una entrada a
    // FAMILIAS_A_DESGLOSAR. Cada entrada corre una sola vez.
    const PRECIOS_LINEA_EBOOKS = { ebook: '99', anexo: '50', app: '50', paquete: '149' };
    async function crearFamiliaEbookDesglosada({ tituloBase, categoria, carpetaSeed, archivos }) {
      const SEED_DIR = path.join(__dirname, '..', 'seed-archivos', carpetaSeed);
      const nuevoProducto = (titulo, categoriaItem, precio, boton, nombreArchivo) => {
        const item = {
          id: nextId(data.products),
          orden: data.products.length,
          categoria: categoriaItem,
          etiqueta: '',
          destacado: '',
          titulo,
          subtitulo: '',
          descripcionCorta: '',
          descripcionLarga: '',
          bullets: [],
          precio,
          precioAnterior: '',
          precioMembresia: '',
          boton,
          imagen: '',
          galeria: [],
          archivo: '',
          archivoNombre: '',
          slug: '',
          productosRelacionados: [],
          esPaquete: false,
          ocultoEnCatalogo: false,
        };
        item.slug = slugUnico(titulo, data.products, item.id);
        data.products.push(item);
        if (nombreArchivo) {
          const origen = path.join(SEED_DIR, nombreArchivo);
          if (fs.existsSync(origen)) {
            const destino = `${crypto.randomUUID()}${path.extname(nombreArchivo)}`;
            fs.copyFileSync(origen, path.join(UPLOAD_DIR, destino));
            item.archivo = `/uploads/${destino}`;
            item.archivoNombre = nombreArchivo;
          }
        }
        return item;
      };
      const anexo = nuevoProducto(`Anexo Excel · ${tituloBase}`, 'anexo', PRECIOS_LINEA_EBOOKS.anexo, 'Añadir anexo Excel al carrito', archivos.anexo);
      const app = nuevoProducto(`App · ${tituloBase}`, categoria, PRECIOS_LINEA_EBOOKS.app, 'Añadir app al carrito', archivos.app);
      anexo.ocultoEnCatalogo = true;
      app.ocultoEnCatalogo = true;
      const paquete = nuevoProducto(`${tituloBase} · Paquete completo`, categoria, PRECIOS_LINEA_EBOOKS.paquete, 'Comprar paquete completo', archivos.paquete || null);
      paquete.esPaquete = true;
      paquete.ocultoEnCatalogo = true;
      paquete.precioMembresia = '100';
      const ebook = nuevoProducto(tituloBase, categoria, PRECIOS_LINEA_EBOOKS.ebook, 'Agregar al carrito', archivos.ebook);
      ebook.productosRelacionados = [anexo.id, app.id, paquete.id];
      // Portada: si se manda una foto pre-generada, se usa esa. Si no, se
      // genera sola a partir de la primera pagina del PDF del ebook, igual
      // que cuando el administrador sube un PDF a mano desde /admin.
      if (archivos.portada) {
        const origenPortada = path.join(SEED_DIR, archivos.portada);
        if (fs.existsSync(origenPortada)) {
          const destinoPortada = `${crypto.randomUUID()}${path.extname(archivos.portada)}`;
          fs.copyFileSync(origenPortada, path.join(UPLOAD_DIR, destinoPortada));
          ebook.imagen = `/uploads/${destinoPortada}`;
        }
      } else if (ebook.archivo) {
        try {
          const buffer = await generarCaratulaPDF(path.join(UPLOAD_DIR, path.basename(ebook.archivo)));
          if (buffer) {
            const destinoPortada = `${crypto.randomUUID()}.png`;
            fs.writeFileSync(path.join(UPLOAD_DIR, destinoPortada), buffer);
            ebook.imagen = `/uploads/${destinoPortada}`;
          }
        } catch (e) {
          console.error(`[store] No se pudo generar la caratula automatica de "${tituloBase}":`, e.message);
        }
      }
    }
    const FAMILIAS_A_DESGLOSAR = [
      {
        tituloViejo: 'Galletas Tipo New York · Paquete completo',
        tituloBase: 'Galletas Tipo New York',
        categoria: 'ebook',
        carpetaSeed: 'galletas-tipo-new-york',
        archivos: { ebook: 'Endulcora_Galletas_NY_eBook.pdf', anexo: 'Endulcora_Galletas_NY_Calculadora_Costos_Merma_Precios.xlsx', app: 'Endulcora_Galletas_NY_APP.html', paquete: 'Paquete_Completo.zip' },
      },
      {
        tituloViejo: 'Repostería para Diabéticos · Paquete completo',
        tituloBase: 'Repostería para Diabéticos',
        categoria: 'ebook',
        carpetaSeed: 'reposteria-para-diabeticos',
        archivos: { ebook: 'Endulcora_Reposteria_Diabeticos_eBook.pdf', anexo: 'Endulcora_Reposteria_Diabeticos_Calculadora_Costos_Merma_Precios.xlsx', app: 'Endulcora_Reposteria_Diabeticos_APP.html', paquete: 'Paquete_Completo.zip' },
      },
      {
        // Productos nuevos, sin producto viejo que borrar.
        tituloBase: 'Tamales Oaxaqueños',
        categoria: 'ebook',
        carpetaSeed: 'tamales-oaxaquenos',
        archivos: { ebook: 'Endulcora_Tamales_Oaxaquenos_eBook.pdf', anexo: 'Endulcora_Tamales_Oaxaquenos_Calculadora_Costos_Merma_Precios.xlsx', app: 'Endulcora_Tamales_Oaxaquenos_APP.html', paquete: 'Paquete_Completo.zip' },
      },
      {
        tituloBase: 'Tamales Regionales',
        categoria: 'ebook',
        carpetaSeed: 'tamales-regionales',
        archivos: { ebook: 'Endulcora_Tamales_Regionales_eBook.pdf', anexo: 'Endulcora_Tamales_Regionales_Calculadora_Costos_Merma_Precios.xlsx', app: 'Endulcora_Tamales_Regionales_APP.html', paquete: 'Paquete_Completo.zip' },
      },
      {
        tituloBase: 'Panadería Mexicana Salada',
        categoria: 'ebook',
        carpetaSeed: 'panaderia-mexicana-salada',
        archivos: { ebook: 'Endulcora_Panaderia_Mexicana_Salada_eBook.pdf', anexo: 'Endulcora_Panaderia_Mexicana_Salada_Calculadora_Costos_Merma_Precios.xlsx', app: 'Endulcora_Panaderia_Mexicana_Salada_APP.html', paquete: 'Paquete_Completo.zip' },
      },
      {
        tituloBase: 'Nogada de Autor',
        categoria: 'ebook',
        carpetaSeed: 'nogada-de-autor',
        archivos: { ebook: 'Endulcora_Nogada_de_Autor_eBook.pdf', anexo: 'Endulcora_Nogada_de_Autor_Calculadora_Costos_Merma_Precios.xlsx', app: 'Endulcora_Nogada_de_Autor_APP.html', paquete: 'Paquete_Completo.zip' },
      },
      {
        tituloBase: 'Dulces Mexicanos Tradicionales',
        categoria: 'ebook',
        carpetaSeed: 'dulces-mexicanos-tradicionales',
        archivos: { ebook: 'Endulcora_Dulces_Mexicanos_Tradicionales_eBook.pdf', anexo: 'Endulcora_Dulces_Mexicanos_Tradicionales_Calculadora_Costos_Merma_Precios.xlsx', app: 'Endulcora_Dulces_Mexicanos_Tradicionales_APP.html', paquete: 'Paquete_Completo.zip' },
      },
      {
        tituloBase: 'Panqués y Pound Cakes Gourmet',
        categoria: 'ebook',
        carpetaSeed: 'panques-pound-cakes-gourmet',
        archivos: { ebook: 'Endulcora_Panques_Pound_Cakes_Gourmet_eBook.pdf', anexo: 'Endulcora_Panques_Pound_Cakes_Gourmet_Calculadora_Costos_Merma_Precios.xlsx', app: 'Endulcora_Panques_Pound_Cakes_Gourmet_APP.html', paquete: 'Paquete_Completo.zip', portada: 'Portada.png' },
      },
      {
        tituloBase: 'Coctelería Mexicana',
        categoria: 'ebook',
        carpetaSeed: 'cocteleria-mexicana',
        archivos: { ebook: 'Endulcora_Cocteleria_Mexicana_eBook.pdf', anexo: 'Endulcora_Cocteleria_Mexicana_Calculadora_Costos_Merma_Precios.xlsx', app: 'Endulcora_Cocteleria_Mexicana_APP.html', paquete: 'Paquete_Completo.zip', portada: 'Portada.png' },
      },
      {
        tituloBase: 'Palomitas Gourmet de Autor',
        categoria: 'ebook',
        carpetaSeed: 'palomitas-gourmet-de-autor',
        archivos: { ebook: 'Endulcora_Palomitas_Gourmet_de_Autor_eBook.pdf', anexo: 'Endulcora_Palomitas_Gourmet_de_Autor_Calculadora_Costos_Merma_Precios.xlsx', app: 'Endulcora_Palomitas_Gourmet_de_Autor_APP.html', paquete: 'Paquete_Completo.zip', portada: 'Portada.png' },
      },
      {
        tituloBase: 'Tacos de Canasta',
        categoria: 'ebook',
        carpetaSeed: 'tacos-de-canasta',
        archivos: { ebook: 'Endulcora_Tacos_de_Canasta_eBook.pdf', anexo: 'Endulcora_Tacos_de_Canasta_Calculadora_Costos_Merma_Precios.xlsx', app: 'Endulcora_Tacos_de_Canasta_APP.html', paquete: 'Paquete_Completo.zip', portada: 'Portada.png' },
      },
      {
        tituloBase: 'Tiramisú Douyin',
        categoria: 'ebook',
        carpetaSeed: 'tiramisu-douyin',
        archivos: { ebook: 'Endulcora_Tiramisu_Douyin_eBook.pdf', anexo: 'Endulcora_Tiramisu_Douyin_Calculadora_Costos_Merma_Precios.xlsx', app: 'Endulcora_Tiramisu_Douyin_APP.html', paquete: 'Paquete_Completo.zip', portada: 'Portada.png' },
      },
      {
        tituloBase: 'Cocina Española',
        categoria: 'ebook',
        carpetaSeed: 'cocina-espanola',
        archivos: { ebook: 'Endulcora_Cocina_Espanola_eBook.pdf', anexo: 'Endulcora_Cocina_Espanola_Calculadora_Costos_Merma_Precios.xlsx', app: 'Endulcora_Cocina_Espanola_APP.html', paquete: 'Paquete_Completo.zip', portada: 'Portada_Foto.jpeg' },
      },
      {
        tituloBase: 'Macarons',
        categoria: 'ebook',
        carpetaSeed: 'macarons',
        archivos: { ebook: 'Endulcora_Macarons_eBook.pdf', anexo: 'Endulcora_Macarons_Calculadora_Costos_Merma_Precios.xlsx', app: 'Endulcora_Macarons_APP.html', paquete: 'Paquete_Completo.zip', portada: 'Portada_Foto.jpeg' },
      },
      {
        tituloBase: 'Pizza',
        categoria: 'ebook',
        carpetaSeed: 'pizza',
        archivos: { ebook: 'Endulcora_Pizza_eBook.pdf', anexo: 'Endulcora_Pizza_Calculadora_Costos_Merma_Precios.xlsx', app: 'Endulcora_Pizza_APP.html', paquete: 'Paquete_Completo.zip', portada: 'Portada_Foto.jpeg' },
      },
      {
        tituloBase: 'Pastelería Básica',
        categoria: 'ebook',
        carpetaSeed: 'pasteleria-basica',
        archivos: { ebook: 'Endulcora_Pasteleria_Basica_eBook.pdf', anexo: 'Endulcora_Pasteleria_Basica_Calculadora_Costos_Merma_Precios.xlsx', app: 'Endulcora_Pasteleria_Basica_APP.html', paquete: 'Paquete_Completo.zip' },
      },
      {
        tituloBase: 'Pan de Muerto',
        categoria: 'ebook',
        carpetaSeed: 'pan-de-muerto',
        archivos: { ebook: 'Endulcora_Pan_de_Muerto_eBook.pdf', anexo: 'Endulcora_Pan_de_Muerto_Calculadora_Costos_Merma_Precios.xlsx', app: 'Endulcora_Pan_de_Muerto_APP.html', paquete: 'Paquete_Completo.zip' },
      },
      {
        tituloBase: 'Masa Madre',
        categoria: 'ebook',
        carpetaSeed: 'masa-madre',
        archivos: { ebook: 'Endulcora_Masa_Madre_eBook.pdf', anexo: 'Endulcora_Masa_Madre_Calculadora_Costos_Merma_Precios.xlsx', app: 'Endulcora_Masa_Madre_APP.html', paquete: 'Paquete_Completo.zip' },
      },
      {
        tituloBase: 'Postres en Vaso',
        categoria: 'ebook',
        carpetaSeed: 'postres-en-vaso',
        archivos: { ebook: 'Endulcora_Postres_en_Vaso_eBook.pdf', anexo: 'Endulcora_Postres_en_Vaso_Calculadora_Costos_Merma_Precios.xlsx', app: 'Endulcora_Postres_en_Vaso_APP.html', paquete: 'Paquete_Completo.zip' },
      },
      {
        tituloBase: 'Sushi',
        categoria: 'ebook',
        carpetaSeed: 'sushi',
        archivos: { ebook: 'Endulcora_Sushi_eBook.pdf', anexo: 'Endulcora_Sushi_Calculadora_Costos_Merma_Precios.xlsx', app: 'Endulcora_Sushi_APP.html', paquete: 'Paquete_Completo.zip' },
      },
      {
        tituloBase: 'Tablas de Charcutería',
        categoria: 'ebook',
        carpetaSeed: 'tablas-charcuteria',
        archivos: { ebook: 'Endulcora_Tablas_de_Charcuteria_eBook.pdf', anexo: 'Endulcora_Tablas_de_Charcuteria_Calculadora_Costos_Merma_Precios.xlsx', app: 'Endulcora_Tablas_de_Charcuteria_APP.html', paquete: 'Paquete_Completo.zip' },
      },
      {
        tituloBase: 'Fresas Cubiertas',
        categoria: 'ebook',
        carpetaSeed: 'fresas-cubiertas',
        archivos: { ebook: 'Endulcora_Fresas_Cubiertas_eBook.pdf', anexo: 'Endulcora_Fresas_Cubiertas_Calculadora_Costos_Merma_Precios.xlsx', app: 'Endulcora_Fresas_Cubiertas_APP.html', paquete: 'Paquete_Completo.zip' },
      },
      {
        tituloBase: 'Barbacoa',
        categoria: 'ebook',
        carpetaSeed: 'barbacoa',
        archivos: { ebook: 'Endulcora_Barbacoa_eBook.pdf', anexo: 'Endulcora_Barbacoa_Calculadora_Costos_Merma_Precios.xlsx', app: 'Endulcora_Barbacoa_APP.html', paquete: 'Paquete_Completo.zip' },
      },
      // Los 5 que mando Manuel el 23 oct — sin paquete completo (no se
      // incluyo ese zip), la portada se genera sola de la primera pagina
      // del PDF como con cualquier otro que no trae foto profesional.
      {
        tituloBase: 'Aguas Michoacanas',
        categoria: 'ebook',
        carpetaSeed: 'aguas-michoacanas',
        archivos: { ebook: 'EBOOK_AGUAS_MICHOACANAS_Endulcora.pdf', anexo: 'ANEXO_1_Aguas_Michoacanas_Costeo_Merma_Precios_Endulcora.xlsx', app: 'ANEXO_2_Aguas_Michoacanas_APP_Costos_Endulcora.html' },
      },
      {
        tituloBase: 'Galletas Decoradas',
        categoria: 'ebook',
        carpetaSeed: 'galletas-decoradas',
        archivos: { ebook: 'EBOOK_GALLETAS_DECORADAS_Endulcora.pdf', anexo: 'ANEXO_1_Galletas_Decoradas_Costeo_Merma_Precios_Endulcora.xlsx', app: 'ANEXO_2_Galletas_Decoradas_APP_Costos_Endulcora.html' },
      },
      {
        tituloBase: 'Gomas y Gomitas',
        categoria: 'ebook',
        carpetaSeed: 'gomas-y-gomitas',
        archivos: { ebook: 'EBOOK_GOMAS_Y_GOMITAS_Endulcora.pdf', anexo: 'ANEXO_1_Gomitas_Costeo_Merma_Precios_Endulcora.xlsx', app: 'ANEXO_2_Gomitas_APP_Costos_Endulcora.html' },
      },
      {
        tituloBase: 'Pan de Muerto Gourmet',
        categoria: 'ebook',
        carpetaSeed: 'pan-de-muerto-gourmet',
        archivos: { ebook: 'EBOOK_PAN_DE_MUERTO_GOURMET_Endulcora.pdf', anexo: 'ANEXO_1_Pan_de_Muerto_Costeo_Merma_Precios_Endulcora.xlsx', app: 'ANEXO_2_Pan_de_Muerto_APP_Costos_Endulcora.html' },
      },
      {
        tituloBase: 'Pastelería Científica para Diabéticos',
        categoria: 'ebook',
        carpetaSeed: 'pasteleria-cientifica-diabeticos',
        archivos: { ebook: 'EBOOK_PASTELERIA_CIENTIFICA_DIABETICOS_Endulcora.pdf', anexo: 'ANEXO_1_Pasteleria_Diabeticos_Costeo_Merma_Precios_Endulcora.xlsx', app: 'ANEXO_2_Pasteleria_Diabeticos_APP_Costos_Endulcora.html' },
      },
    ];
    for (const familia of FAMILIAS_A_DESGLOSAR) {
      const flag = `_migDesglose_${slugify(familia.tituloBase)}`;
      if (data[flag]) continue;
      if (familia.tituloViejo) {
        const viejo = data.products.find((p) => (p.titulo || '').toLowerCase() === familia.tituloViejo.toLowerCase());
        if (!viejo) continue;
        data.products = data.products.filter((p) => p.id !== viejo.id);
        if (typeof viejo.imagen === 'string' && viejo.imagen.startsWith('/uploads/')) {
          fs.unlink(path.join(UPLOAD_DIR, path.basename(viejo.imagen)), () => {});
        }
        if (typeof viejo.archivo === 'string' && viejo.archivo.startsWith('/uploads/')) {
          fs.unlink(path.join(UPLOAD_DIR, path.basename(viejo.archivo)), () => {});
        }
      }
      await crearFamiliaEbookDesglosada(familia);
      data[flag] = true;
      changed = true;
    }
    // Portadas con fotografia real del platillo/bebida, para reemplazar la
    // caratula generica (autogenerada de la primera pagina del PDF) cuando
    // el cliente manda fotos profesionales. Corre una sola vez por producto
    // y no depende de si la familia ya existia o se acaba de crear arriba.
    const PORTADAS_REALES = [
      { slug: 'panques-y-pound-cakes-gourmet', carpetaSeed: 'panques-pound-cakes-gourmet', archivo: 'Portada_Foto.jpeg' },
      { slug: 'cocteleria-mexicana', carpetaSeed: 'cocteleria-mexicana', archivo: 'Portada_Foto.jpeg' },
      { slug: 'dulces-mexicanos-tradicionales', carpetaSeed: 'dulces-mexicanos-tradicionales', archivo: 'Portada_Foto.jpeg' },
      { slug: 'tacos-de-canasta', carpetaSeed: 'tacos-de-canasta', archivo: 'Portada_Foto.jpeg' },
      { slug: 'palomitas-gourmet-de-autor', carpetaSeed: 'palomitas-gourmet-de-autor', archivo: 'Portada_Foto.jpeg' },
      { slug: 'tiramisu-douyin', carpetaSeed: 'tiramisu-douyin', archivo: 'Portada_Foto.jpeg' },
      { slug: 'pasteleria-basica', carpetaSeed: 'pasteleria-basica', archivo: 'Portada_Foto.jpg' },
      { slug: 'pan-de-muerto', carpetaSeed: 'pan-de-muerto', archivo: 'Portada_Foto.jpg' },
      { slug: 'masa-madre', carpetaSeed: 'masa-madre', archivo: 'Portada_Foto.jpg' },
      { slug: 'postres-en-vaso', carpetaSeed: 'postres-en-vaso', archivo: 'Portada_Foto.jpg' },
      { slug: 'sushi', carpetaSeed: 'sushi', archivo: 'Portada_Foto.jpg' },
      { slug: 'tablas-de-charcuteria', carpetaSeed: 'tablas-charcuteria', archivo: 'Portada_Foto.jpg' },
      { slug: 'fresas-cubiertas', carpetaSeed: 'fresas-cubiertas', archivo: 'Portada_Foto.jpg' },
      { slug: 'barbacoa', carpetaSeed: 'barbacoa', archivo: 'Portada_Foto.jpg' },
      { slug: 'aguas-michoacanas', carpetaSeed: 'aguas-michoacanas', archivo: 'Portada_Foto.jpg' },
      { slug: 'galletas-decoradas', carpetaSeed: 'galletas-decoradas', archivo: 'Portada_Foto.jpg' },
      { slug: 'gomas-y-gomitas', carpetaSeed: 'gomas-y-gomitas', archivo: 'Portada_Foto.jpg' },
      { slug: 'pan-de-muerto-gourmet', carpetaSeed: 'pan-de-muerto-gourmet', archivo: 'Portada_Foto.jpg' },
      { slug: 'pasteleria-cientifica-para-diabeticos', carpetaSeed: 'pasteleria-cientifica-diabeticos', archivo: 'Portada_Foto.jpg' },
    ];
    for (const p of PORTADAS_REALES) {
      const flag = `_migPortadaReal_${p.slug}`;
      if (data[flag]) continue;
      data[flag] = true;
      changed = true;
      const producto = data.products.find((x) => x.slug === p.slug);
      if (!producto) continue;
      const origen = path.join(__dirname, '..', 'seed-archivos', p.carpetaSeed, p.archivo);
      if (!fs.existsSync(origen)) continue;
      const anteriorImagen = producto.imagen;
      const destino = `${crypto.randomUUID()}${path.extname(p.archivo)}`;
      fs.copyFileSync(origen, path.join(UPLOAD_DIR, destino));
      producto.imagen = `/uploads/${destino}`;
      if (typeof anteriorImagen === 'string' && anteriorImagen.startsWith('/uploads/')) {
        fs.unlink(path.join(UPLOAD_DIR, path.basename(anteriorImagen)), () => {});
      }
    }
    // Completa el archivo del "paquete completo" de familias que ya se
    // crearon antes de que existiera archivos.paquete en la config de
    // arriba (para no dejarlo sin descarga). Si el producto ya tiene un
    // archivo, no lo pisa.
    for (const familia of FAMILIAS_A_DESGLOSAR) {
      if (!familia.archivos.paquete) continue;
      const paquete = data.products.find((p) => p.titulo === `${familia.tituloBase} · Paquete completo`);
      if (!paquete || paquete.archivo) continue;
      const origen = path.join(__dirname, '..', 'seed-archivos', familia.carpetaSeed, familia.archivos.paquete);
      if (!fs.existsSync(origen)) continue;
      const destino = `${crypto.randomUUID()}${path.extname(familia.archivos.paquete)}`;
      fs.copyFileSync(origen, path.join(UPLOAD_DIR, destino));
      paquete.archivo = `/uploads/${destino}`;
      paquete.archivoNombre = familia.archivos.paquete;
      changed = true;
    }
    // Pone la foto de portada (seed-archivos/<carpeta>/portada.jpg) al eBook
    // principal de cada familia, si todavia no tiene una. No pisa una
    // portada que ya se haya subido a mano desde /admin.
    for (const familia of FAMILIAS_A_DESGLOSAR) {
      const ebookPrincipal = data.products.find((p) => p.titulo === familia.tituloBase);
      if (!ebookPrincipal || ebookPrincipal.imagen) continue;
      const origen = path.join(__dirname, '..', 'seed-archivos', familia.carpetaSeed, 'portada.jpg');
      if (!fs.existsSync(origen)) continue;
      const destino = `${crypto.randomUUID()}.jpg`;
      fs.copyFileSync(origen, path.join(UPLOAD_DIR, destino));
      ebookPrincipal.imagen = `/uploads/${destino}`;
      changed = true;
    }
    // Corrige el enlace del "paquete completo" en la pagina del eBook de
    // Velas Comestibles: por un producto duplicado que ya existia de antes
    // (mismo nombre, distinto id), la migracion original engancho el
    // paquete equivocado (uno que solo entrega el PDF del eBook) en vez
    // del paquete real (el que entrega los 3 archivos en un ZIP).
    if (!data._fixVelasComestiblesPaqueteLink) {
      const ebookVelas = data.products.find((p) => p.slug === 'velas-comestibles');
      const paqueteReal = data.products.find((p) => p.slug === 'velas-comestibles-paquete-completo');
      if (ebookVelas && paqueteReal) {
        const limpios = ebookVelas.productosRelacionados.filter((id) => id !== 1);
        if (!limpios.includes(paqueteReal.id)) limpios.push(paqueteReal.id);
        ebookVelas.productosRelacionados = limpios;
        data._fixVelasComestiblesPaqueteLink = true;
        changed = true;
      }
    }
    // Consolida los duplicados: Velas Comestibles, Galletas Tipo New York,
    // Reposteria para Diabeticos y Roles Gourmet ya tenian, desde antes de
    // este trabajo, su propio eBook/Anexo/App con foto y contenido real.
    // Se copia ese contenido (foto, textos, bullets) a los productos nuevos
    // y se borran los viejos, incluyendo el slug (para no perder el enlace
    // publico que ya existia). No se toca el archivo descargable del
    // producto nuevo (ya tiene el suyo propio) ni se borra la foto (ahora
    // la usa el producto nuevo).
    const CONSOLIDACIONES = [
      {
        pares: [
          { viejoSlug: 'velas-comestibles-paquete', nuevoSlug: 'velas-comestibles' },
          { viejoSlug: 'costeo-de-velas-comestibles-excel', nuevoSlug: 'anexo-excel-velas-comestibles' },
          { viejoSlug: 'calculadora-velas-comestibles-app', nuevoSlug: 'app-velas-comestibles' },
        ],
        paquete: { slug: 'velas-comestibles-paquete-completo', precio: '149', boton: 'Comprar paquete completo' },
      },
      {
        pares: [
          { viejoSlug: 'galletas-tipo-new-york', nuevoSlug: 'galletas-tipo-new-york-2' },
          { viejoSlug: 'costeo-de-galletas-tipo-new-york-excel', nuevoSlug: 'anexo-excel-galletas-tipo-new-york' },
          { viejoSlug: 'calculadora-galletas-tipo-new-york-app', nuevoSlug: 'app-galletas-tipo-new-york' },
        ],
      },
      {
        pares: [
          { viejoSlug: 'reposteria-para-diabeticos', nuevoSlug: 'reposteria-para-diabeticos-2' },
          { viejoSlug: 'costeo-de-reposteria-para-diabeticos-excel', nuevoSlug: 'anexo-excel-reposteria-para-diabeticos' },
          { viejoSlug: 'calculadora-reposteria-para-diabeticos-app', nuevoSlug: 'app-reposteria-para-diabeticos' },
        ],
      },
    ];
    if (!data._migConsolidaDuplicados) {
      let algoCambio = false;
      for (const c of CONSOLIDACIONES) {
        for (const par of c.pares) {
          const viejo = data.products.find((p) => p.slug === par.viejoSlug);
          const nuevo = data.products.find((p) => p.slug === par.nuevoSlug);
          if (!viejo || !nuevo) continue;
          nuevo.etiqueta = viejo.etiqueta || nuevo.etiqueta;
          nuevo.destacado = viejo.destacado || nuevo.destacado;
          nuevo.subtitulo = viejo.subtitulo || nuevo.subtitulo;
          nuevo.bullets = viejo.bullets && viejo.bullets.length ? viejo.bullets : nuevo.bullets;
          nuevo.descripcionCorta = viejo.descripcionCorta || nuevo.descripcionCorta;
          nuevo.descripcionLarga = viejo.descripcionLarga || nuevo.descripcionLarga;
          nuevo.imagen = viejo.imagen || nuevo.imagen;
          if (typeof viejo.archivo === 'string' && viejo.archivo.startsWith('/uploads/')) {
            fs.unlink(path.join(UPLOAD_DIR, path.basename(viejo.archivo)), () => {});
          }
          nuevo.slug = par.viejoSlug;
          data.products = data.products.filter((p) => p.id !== viejo.id);
          algoCambio = true;
        }
        if (c.paquete) {
          const paquete = data.products.find((p) => p.slug === c.paquete.slug);
          if (paquete) {
            paquete.precio = c.paquete.precio;
            paquete.boton = c.paquete.boton;
            paquete.ocultoEnCatalogo = true;
            paquete.productosRelacionados = [];
            paquete.precioAnterior = '';
            algoCambio = true;
          }
        }
      }
      if (algoCambio) {
        data._migConsolidaDuplicados = true;
        changed = true;
      }
    }
    // El negocio dejo de vender recetarios: de ahora en adelante todo se
    // vende como eBooks con anexos. Borra todos los productos de categoria
    // "recetario" (confirmado que ninguno tenia ventas previas). Corre una
    // sola vez.
    if (!data._migBorraRecetarios) {
      const recetarios = data.products.filter((p) => p.categoria === 'recetario');
      recetarios.forEach((p) => {
        if (typeof p.imagen === 'string' && p.imagen.startsWith('/uploads/')) {
          fs.unlink(path.join(UPLOAD_DIR, path.basename(p.imagen)), () => {});
        }
        if (typeof p.archivo === 'string' && p.archivo.startsWith('/uploads/')) {
          fs.unlink(path.join(UPLOAD_DIR, path.basename(p.archivo)), () => {});
        }
      });
      if (recetarios.length) {
        data.products = data.products.filter((p) => p.categoria !== 'recetario');
      }
      data._migBorraRecetarios = true;
      changed = true;
    }
    // 'Panque de Elote Especial' nunca tuvo eBook real (solo una linea de
    // descripcion). Se oculta del catalogo hasta que exista el archivo —
    // no se borra, para no perder el producto si se retoma despues. Corre
    // una sola vez (si el admin lo vuelve a mostrar a mano, no se le pisa).
    if (!data._migOcultaPanqueDeEloteEspecial) {
      const panque = data.products.find((p) => p.slug === 'panque-de-elote-especial');
      if (panque) panque.ocultoEnCatalogo = true;
      data._migOcultaPanqueDeEloteEspecial = true;
      changed = true;
    }
    // 'Costos, Merma y Precios' (calculadora generica, no de una receta en
    // particular) ya no aplica: se descontinua y se borra del catalogo.
    // Corre una sola vez.
    if (!data._migBorraCostosMermaYPrecios) {
      const costosGenerico = data.products.find((p) => p.slug === 'costos-merma-y-precios');
      if (costosGenerico) {
        if (typeof costosGenerico.imagen === 'string' && costosGenerico.imagen.startsWith('/uploads/')) {
          fs.unlink(path.join(UPLOAD_DIR, path.basename(costosGenerico.imagen)), () => {});
        }
        if (typeof costosGenerico.archivo === 'string' && costosGenerico.archivo.startsWith('/uploads/')) {
          fs.unlink(path.join(UPLOAD_DIR, path.basename(costosGenerico.archivo)), () => {});
        }
        data.products = data.products.filter((p) => p.id !== costosGenerico.id);
      }
      data._migBorraCostosMermaYPrecios = true;
      changed = true;
    }
    // 'Oficios Dulces Vol. I + II' era un paquete que iba a combinar Velas
    // Comestibles + Galletas Estilo Nueva York, pero Galletas Estilo Nueva
    // York nunca tuvo su propio Anexo Excel ni App (esos archivos no
    // existen), asi que el paquete no se puede armar como estaba descrito.
    // Se descontinua y se borra del catalogo. Corre una sola vez.
    if (!data._migBorraOficiosDulces) {
      const oficiosDulces = data.products.find((p) => p.slug === 'oficios-dulces-vol-i-ii');
      if (oficiosDulces) {
        if (typeof oficiosDulces.imagen === 'string' && oficiosDulces.imagen.startsWith('/uploads/')) {
          fs.unlink(path.join(UPLOAD_DIR, path.basename(oficiosDulces.imagen)), () => {});
        }
        if (typeof oficiosDulces.archivo === 'string' && oficiosDulces.archivo.startsWith('/uploads/')) {
          fs.unlink(path.join(UPLOAD_DIR, path.basename(oficiosDulces.archivo)), () => {});
        }
        data.products = data.products.filter((p) => p.id !== oficiosDulces.id);
      }
      data._migBorraOficiosDulces = true;
      changed = true;
    }
    // El aviso de privacidad no decia nada sobre compartir datos con Levent
    // (la matriz) y las demas marcas del grupo, algo necesario ahora que se
    // arma una base de datos general para campanas y analisis compartidos.
    // Solo se actualiza si nadie lo edito a mano desde el admin (sigue igual
    // al texto viejo por defecto); si ya lo cambiaron, se deja como esta.
    if (!data._migAvisoPrivacidadLevent) {
      const textoViejo =
        'Endulcora · Estudio Gastronómico, con domicilio en Ciudad de México, es responsable del tratamiento de tus datos personales.\n\nQué recabamos. Nombre, correo electrónico y teléfono, y los datos de facturación cuando los solicitas.\n\nPara qué. Entregar tus compras digitales, darte acceso a tus cursos, emitir comprobantes y avisarte de nuevas publicaciones. No vendemos ni compartimos tus datos con terceros ajenos a estos fines.\n\nTus derechos ARCO. Puedes acceder, rectificar, cancelar u oponerte al uso de tus datos escribiendo a nuestro WhatsApp. Respondemos en un máximo de 20 días hábiles.';
      if (data.content.legal_privacidad === textoViejo) {
        data.content.legal_privacidad = DEFAULT_CONTENT.legal_privacidad;
      }
      data._migAvisoPrivacidadLevent = true;
      changed = true;
    }
    // Suma a la lista de campañas de correo masivo (contactosCampana) todos
    // los registros que ya existian antes de que esto se conectara: talleres
    // y QR que aceptaron promociones, y todos los suscriptores del correo.
    // Corre una sola vez; de ahi en adelante cada formulario se suma solo.
    if (!data._migBackfillContactosCampana) {
      (data.inscripcionesTaller || []).forEach((i) => {
        if (i.aceptaPromociones) upsertContactoCampana(data, { email: i.correo, nombre: i.nombre, telefono: i.whatsapp });
      });
      (data.registrosQr || []).forEach((r) => {
        if (r.aceptaPromociones) upsertContactoCampana(data, { email: r.correo, nombre: r.nombre, telefono: r.whatsapp });
      });
      (data.subscribers || []).forEach((s) => {
        upsertContactoCampana(data, { email: s.email });
      });
      data._migBackfillContactosCampana = true;
      changed = true;
    }
    // Segunda pasada: tambien suma a la lista de campañas todas las cuentas
    // de clientes ya existentes (registro separado del anterior porque se
    // decidio despues incluirlas tambien).
    if (!data._migBackfillContactosCampanaUsuarios) {
      (data.users || []).forEach((u) => {
        upsertContactoCampana(data, { email: u.email, nombre: u.nombre, telefono: u.telefono });
      });
      data._migBackfillContactosCampanaUsuarios = true;
      changed = true;
    }
    // Tercera pasada: suma tambien a quien compro pagando como invitado
    // (sin crear cuenta, solo dejo su correo al pagar) — sin esto esos
    // clientes reales se quedaban fuera de toda lista.
    if (!data._migBackfillContactosCampanaPedidos) {
      (data.orders || []).forEach((o) => {
        if (o.estado === 'aprobado' && o.email) upsertContactoCampana(data, { email: o.email });
      });
      data._migBackfillContactosCampanaPedidos = true;
      changed = true;
    }
    // Curso de Masa Madre (presencial, 5 sesiones): oferta de la clase
    // gratis en sala. precioMembresia vacio = sin rebaja para miembros,
    // pendiente de que direccion lo confirme; se puede editar despues desde
    // /admin > Cursos sin tocar codigo.
    if (!data._migCursoMasaMadre) {
      data.cursos.push({
        id: nextId(data.cursos),
        orden: data.cursos.length,
        modalidad: 'Presencial · 5 sesiones / 20 h (lunes a viernes)',
        titulo: 'Curso de Masa Madre',
        descripcion: 'Fermentación y panadería a fondo, de la creación del starter al horneado. Cupo de 8 a 15 personas.',
        precio: '5000',
        precioMembresia: '',
      });
      data._migCursoMasaMadre = true;
      changed = true;
    }
    // Recetario de Pan de Muerto (suelto): oferta de la clase gratis en
    // sala. Oculto del catalogo general porque solo se ofrece ahi; el PDF
    // se sube despues desde /admin > Productos cuando este listo.
    if (!data._migRecetarioPanDeMuerto) {
      const item = {
        id: nextId(data.products),
        orden: data.products.length,
        categoria: 'recetario',
        etiqueta: '',
        destacado: '',
        titulo: 'Recetario Pan de Muerto',
        subtitulo: '',
        descripcionCorta: 'El recetario completo de la clase de Pan de Muerto, en PDF.',
        descripcionLarga: '',
        bullets: [],
        precio: '100',
        precioAnterior: '',
        precioMembresia: '',
        boton: 'Comprar recetario',
        imagen: '',
        galeria: [],
        archivo: '',
        archivoNombre: '',
        slug: '',
        productosRelacionados: [],
        esPaquete: false,
        ocultoEnCatalogo: true,
      };
      item.slug = slugUnico(item.titulo, data.products, item.id);
      data.products.push(item);
      data._migRecetarioPanDeMuerto = true;
      changed = true;
    }
    // Los registros de la clase gratis que ya existian (de antes de que se
    // guardara la fecha en cada uno) se marcan con la fecha configurada
    // actualmente, para no dejarlos sin fecha en el Excel agrupado.
    if (!data._migFechaRegistrosClaseGratis) {
      (data.registrosClaseGratis || []).forEach((r) => {
        if (!r.fecha) r.fecha = data.content.clasegratis_fecha || '';
      });
      data._migFechaRegistrosClaseGratis = true;
      changed = true;
    }
    // Confirmacion de asistencia con tope de cupo + lista de espera (control
    // de aforo de la clase gratis, ver confirmarRegistroClaseGratis).
    if (!data._migConfirmacionClaseGratis) {
      (data.registrosClaseGratis || []).forEach((r) => {
        if (typeof r.confirmToken !== 'string' || !r.confirmToken) r.confirmToken = crypto.randomUUID();
        if (typeof r.confirmado !== 'boolean') r.confirmado = false;
        if (r.confirmadoEn === undefined) r.confirmadoEn = null;
        if (typeof r.enListaEspera !== 'boolean') r.enListaEspera = false;
        if (typeof r.correoConfirmarEnviado !== 'boolean') r.correoConfirmarEnviado = false;
        if (typeof r.recordatorio2diasClaseEnviado !== 'boolean') r.recordatorio2diasClaseEnviado = false;
        if (typeof r.recordatorioMismoDiaClaseEnviado !== 'boolean') r.recordatorioMismoDiaClaseEnviado = false;
      });
      data._migConfirmacionClaseGratis = true;
      changed = true;
    }
    // Primera vez que se agregan precio/anticipo/cupo/slug a los talleres
    // (para la futura pagina publica por slug y el cobro real): a las
    // sesiones y a las inscripciones que ya existian se les rellenan los
    // campos nuevos con valores neutros, sin inventar precios.
    if (!data._migCobroTalleres) {
      const slugsUsados = new Set();
      (data.sesionesTaller || []).forEach((s) => {
        if (!s.slug) {
          let base = slugificar(s.titulo) || 'taller';
          let slug = base;
          let n = 2;
          while (slugsUsados.has(slug)) { slug = `${base}-${n}`; n += 1; }
          s.slug = slug;
        }
        slugsUsados.add(s.slug);
        if (s.descripcion === undefined) s.descripcion = '';
        if (s.queAprendes === undefined) s.queAprendes = '';
        if (s.fotoUrl === undefined) s.fotoUrl = '';
        if (s.precioTotal === undefined) s.precioTotal = 0;
        if (s.anticipo === undefined) s.anticipo = 0;
        if (s.cupoMaximo === undefined) s.cupoMaximo = null;
        if (s.hojaSheets === undefined) s.hojaSheets = '';
      });
      (data.inscripcionesTaller || []).forEach((i) => {
        if (i.tipoPago === undefined) i.tipoPago = '';
        if (i.montoPagado === undefined) i.montoPagado = 0;
        if (i.saldo === undefined) i.saldo = null;
        if (i.estadoPago === undefined) i.estadoPago = 'pendiente';
        if (i.pagoId === undefined) i.pagoId = '';
        if (i.vencePendienteEn === undefined) i.vencePendienteEn = null;
      });
      data._migCobroTalleres = true;
      changed = true;
    }
    // Nombre de pestaña de Sheets por taller (Fase 4): vacio = se usa el
    // titulo tal cual al escribir en "Inscritos 2026".
    if (!data._migHojaSheetsTaller) {
      (data.sesionesTaller || []).forEach((s) => {
        if (s.hojaSheets === undefined) s.hojaSheets = '';
      });
      data._migHojaSheetsTaller = true;
      changed = true;
    }
    // Banderas de recordatorio y sincronizacion con Google Sheets (Fase 4):
    // a las inscripciones que ya existian se les rellenan en "no enviado /
    // no sincronizado todavia", nunca en true (no hay que inventar que ya
    // se les mando algo que en realidad nunca salio).
    if (!data._migRecordatoriosTaller) {
      (data.inscripcionesTaller || []).forEach((i) => {
        if (i.recordatorio2diasEnviado === undefined) i.recordatorio2diasEnviado = false;
        if (i.recordatorioMismoDiaEnviado === undefined) i.recordatorioMismoDiaEnviado = false;
        if (i.sheetsSincronizado === undefined) i.sheetsSincronizado = false;
      });
      data._migRecordatoriosTaller = true;
      changed = true;
    }
    // Forma de pago real (Efectivo, Transferencia, Promoción...) para las
    // inscripciones que se registran a mano en /admin — las que ya
    // existian se quedan vacias (equivale a "fue por Mercado Pago").
    if (!data._migFormaPagoTaller) {
      (data.inscripcionesTaller || []).forEach((i) => {
        if (i.formaPago === undefined) i.formaPago = '';
      });
      data._migFormaPagoTaller = true;
      changed = true;
    }
    // Ventas extra (portal de Lex, Fase 2): materiales, ebooks y membresia
    // que se le venden a un inscrito ademas de su taller.
    if (!data._migVentasExtraTaller) {
      (data.inscripcionesTaller || []).forEach((i) => {
        if (!Array.isArray(i.ventasExtra)) i.ventasExtra = [];
      });
      data._migVentasExtraTaller = true;
      changed = true;
    }
    // Asistencia y recetario (portal de Lex, Fase 3).
    if (!data._migAsistenciaTaller) {
      (data.inscripcionesTaller || []).forEach((i) => {
        if (typeof i.asistio !== 'boolean') i.asistio = false;
        if (typeof i.recetarioEnviado !== 'boolean') i.recetarioEnviado = false;
      });
      data._migAsistenciaTaller = true;
      changed = true;
    }
    // Reconocimiento enviado (portal de Lex, Fase 3 parte 2).
    if (!data._migReconocimientoTaller) {
      (data.inscripcionesTaller || []).forEach((i) => {
        if (typeof i.reconocimientoEnviado !== 'boolean') i.reconocimientoEnviado = false;
        if (i.reconocimientoFolio === undefined) i.reconocimientoFolio = null;
      });
      data._migReconocimientoTaller = true;
      changed = true;
    }
    // Pestaña de Sheets por defecto (titulo + " div" si es Division) para
    // las sesiones que ya existian con el campo vacio — las importadas a
    // mano o por la sincronizacion automatica antes de este cambio.
    if (!data._migHojaSheetsTallerAutoNombre) {
      const sedesPorId = new Map((data.sedes || []).map((s) => [s.id, s]));
      (data.sesionesTaller || []).forEach((s) => {
        if (s.hojaSheets) return;
        const sede = sedesPorId.get(s.sedeId);
        s.hojaSheets = `${s.titulo}${esSedeDivision(sede && sede.nombre) ? ' div' : ''}`;
      });
      data._migHojaSheetsTallerAutoNombre = true;
      changed = true;
    }
    // Direccion y link de mapa en cada sede (Fase 2: la pagina publica
    // /talleres/<slug> necesita mostrar "sede con mapa").
    if (!data._migDireccionSedes) {
      (data.sedes || []).forEach((s) => {
        if (s.direccion === undefined) s.direccion = '';
        if (s.mapaLink === undefined) s.mapaLink = '';
      });
      data._migDireccionSedes = true;
      changed = true;
    }
    // Rellena la direccion y el link de mapa reales de cada sede (quedaron
    // vacios desde que se agrego el campo arriba, nadie los habia puesto a
    // mano) — sacados del copy real que ya se manda por WhatsApp. Solo
    // escribe si esta vacio, para no pisar algo que el equipo ya haya
    // corregido en /admin.
    if (!data._migDireccionSedesReales) {
      const DIRECCIONES_SEDES = {
        nativitas: 'Antonio Rodríguez 34, Col. San Simón Ticumac, Ciudad de México (3 cuadras del Metro Portales o Nativitas)',
        'division del norte': 'Av. División del Norte 3651, Plaza Real de Coyoacán Local 7, Coyoacán, Ciudad de México (entre Nezahualpilli y Registro Federal, Tren Ligero)',
      };
      const normalizarNombreSede = (t) => String(t || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      (data.sedes || []).forEach((s) => {
        const direccion = DIRECCIONES_SEDES[normalizarNombreSede(s.nombre)];
        if (!direccion) return;
        if (!s.direccion) s.direccion = direccion;
        if (!s.mapaLink) s.mapaLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(direccion)}`;
      });
      data._migDireccionSedesReales = true;
      changed = true;
    }
    // Campaña noviembre · semana 1 (5-8 nov 2026): 8 talleres con copy de
    // Manuel (artes + info del 22 oct), dados de alta de una sola vez para
    // que cada uno tenga ya su pagina /talleres/<slug> con foto y se pueda
    // ligar desde Meta Ads (en vez de mandar a WhatsApp). Varios talleres
    // tienen dos fechas alternas ("jueves o sabado") — cada fecha es su
    // propia sesion/pagina, como ya funciona el resto del calendario.
    if (!data._migTalleresNov26Semana1) {
      const SEED_DIR_TALLERES = path.join(__dirname, '..', 'seed-archivos', 'talleres-nov26-s1');
      const sedePorNombre = (nombre) => (data.sedes || []).find(
        (s) => s.nombre.toLowerCase().includes(nombre.toLowerCase())
      );
      const sedeNativitas = sedePorNombre('nativitas');
      const sedeDivision = sedePorNombre('divisi');
      const copiarImagen = (archivo) => {
        const origen = path.join(SEED_DIR_TALLERES, archivo);
        if (!fs.existsSync(origen)) return '';
        const destino = `${crypto.randomUUID()}${path.extname(archivo)}`;
        fs.copyFileSync(origen, path.join(UPLOAD_DIR, destino));
        return `/uploads/${destino}`;
      };
      const HORARIO_MANANA = '10:00 am – 2:00 pm';
      const HORARIO_TARDE = '4:00 pm – 8:00 pm';
      const TALLERES_NOV26_S1 = [
        {
          sede: sedeNativitas,
          titulo: 'Cheesecakes Horneados',
          fechas: ['2026-11-05', '2026-11-07'],
          horario: HORARIO_MANANA,
          imagen: 'cheesecake.jpg',
          descripcion: 'El cheesecake horneado, cremoso y sin una sola grieta. New York clásico, zarzamora con compota casera y estilo tortuga. Base firme, batido sin aire y horneado a baño maría. Taller presencial de 4 horas, para principiantes.',
          queAprendes: 'Preparas 3 cheesecakes: New York Clásico, Zarzamora con mermelada natural y Estilo Tortuga. Además aprendes la base de galleta firme, el batido sin aire, el horneado a baño maría sin grietas, y el enfriado, desmolde y conservación.',
        },
        {
          sede: sedeNativitas,
          titulo: 'Chocolatería Básica',
          fechas: ['2026-11-05', '2026-11-07'],
          horario: HORARIO_MANANA,
          imagen: 'chocolate.jpg',
          descripcion: 'El chocolate se trabaja con técnica, no con suerte. Trufas, rocas, enjambres y tortugas. Más el fundido sin errores y una ganache que no se corta. Taller presencial de 4 horas, para principiantes.',
          queAprendes: 'Preparas trufas, rocas, enjambres y tortugas. Además aprendes a distinguir cobertura real de sucedáneo, el fundido controlado sin quemar el chocolate, la ganache (emulsión estable y proporciones), qué hacer si se corta el chocolate, y conservación y empaque.',
        },
        {
          sede: sedeNativitas,
          titulo: 'Velas Comestibles',
          fechas: ['2026-11-06', '2026-11-08'],
          horario: HORARIO_MANANA,
          imagen: 'velas.jpg',
          descripcion: 'Parece una vela. Se enciende. Y se come. Tres velas comestibles: de mantequilla, de chocolate y de frutos rojos. Con mecha comestible y control de flama. Taller presencial de 4 horas, para principiantes.',
          queAprendes: 'Preparas 3 velas comestibles: base de mantequilla, base de chocolate y de frutos rojos. Además aprendes mecha comestible y control de flama, estabilización de la grasa, decoración de cada vela, y conservación y cadena de frío.',
        },
        {
          sede: sedeNativitas,
          titulo: 'Aguas Michoacanas',
          fechas: ['2026-11-06', '2026-11-08'],
          horario: HORARIO_MANANA,
          imagen: 'aguas.jpg',
          descripcion: 'El agua fresca que no se pone aguada ni se va al fondo. 14 aguas: 8 clásicas estilo Michoacana y 6 gourmet de autor. Más el punto de dulzor de la base, contando el hielo. Taller presencial de 4 horas, para principiantes.',
          queAprendes: 'Preparas 14 aguas: horchata, jamaica, limón con chía, tamarindo, fresa con leche, melón, piña colada y mango con chile (clásicas), más jamaica con lavanda, pepino con menta y limón, piña con albahaca y jengibre, guayaba con flor de jamaica, maracuyá con hierbabuena y coco tostado con vainilla (gourmet). Además aprendes el punto de dulzor contando el hielo, que la fruta no se vaya al fondo ni se oxide, y conservación de cada agua.',
        },
        {
          sede: sedeNativitas,
          titulo: 'Tablas de Charcutería',
          fechas: ['2026-11-07'],
          horario: HORARIO_TARDE,
          imagen: 'charcuteria.jpg',
          descripcion: 'La tabla que se roba la reunión. Rosas de charcutería, plisados en abanico, geometría en quesos y zonificación para que luzca llena. Taller vespertino de 4 horas, para principiantes.',
          queAprendes: 'Armas tu propia tabla de 15x25 cm con rosas de charcutería, plisados en abanico, geometría en quesos y zonificación estética. Además aprendes elección de quesos y carnes frías, corte de quesos según su textura, y conservación y empaque para llevar.',
        },
        {
          sede: sedeNativitas,
          titulo: 'Carnitas',
          fechas: ['2026-11-08'],
          horario: HORARIO_MANANA,
          imagen: 'carnitas.jpg',
          descripcion: 'Carnitas doradas por fuera y jugosas por dentro. La receta completa, más las salsas y los nopales que las acompañan. Taller presencial de 4 horas, para principiantes.',
          queAprendes: 'Preparas carnitas completas, las salsas que las acompañan y nopales. Además aprendes selección de cortes, manejo de grasa y temperatura, el punto dorado sin resecar la carne, y conservación.',
        },
        {
          sede: sedeDivision,
          titulo: 'Galletas NY',
          fechas: ['2026-11-05', '2026-11-07'],
          horario: HORARIO_MANANA,
          imagen: 'galletasny.jpg',
          descripcion: 'La galleta gruesa estilo Nueva York, con el centro suave. Cinco rellenas: conejito de chocolate, red velvet, volcán de chocolate y avellana, caramelo especiado y carrot cake. Masa que no se extiende, reposo en frío y el punto exacto de horneado. Taller presencial de 4 horas, para principiantes.',
          queAprendes: 'Preparas 5 galletas rellenas: conejito de chocolate, corazón red velvet, volcán de chocolate y avellana, caramelo especiado y carrot cake. Además aprendes la masa que no se extiende en el horno, reposo en frío y porcionado, el punto de horneado para un centro suave, y conservación y empaque.',
        },
        {
          sede: sedeDivision,
          titulo: 'Tiramisú Douyin',
          fechas: ['2026-11-06', '2026-11-08'],
          horario: HORARIO_MANANA,
          imagen: 'tiramisu.jpg',
          descripcion: 'El tiramisú que está arrasando en redes. Cuatro sabores: mango, frutos rojos, cookies and cream y pistacho. En molde, con capas visibles. Taller presencial de 4 horas, para principiantes.',
          queAprendes: 'Preparas tiramisú en 4 sabores: mango, frutos rojos, cookies and cream y pistacho. Además aprendes crema estable que no se escurre, capas visibles y parejas en molde, remojo justo de la base, y conservación en frío.',
        },
      ];
      TALLERES_NOV26_S1.forEach((t) => {
        if (!t.sede) return; // sede no encontrada: no crea nada a ciegas
        const fotoUrl = copiarImagen(t.imagen);
        t.fechas.forEach((fecha) => {
          const mismaFecha = data.sesionesTaller.filter((s) => s.sedeId === t.sede.id && s.fecha === fecha);
          data.sesionesTaller.push({
            id: nextId(data.sesionesTaller),
            sedeId: t.sede.id,
            fecha,
            titulo: t.titulo,
            estado: 'disponible',
            horario: t.horario,
            orden: mismaFecha.length,
            slug: slugUnicoSesionTaller(data, t.titulo),
            descripcion: t.descripcion,
            queAprendes: t.queAprendes,
            fotoUrl,
            precioTotal: 1149,
            anticipo: 400,
            cupoMaximo: 20,
            hojaSheets: `${t.titulo}${esSedeDivision(t.sede.nombre) ? ' div' : ''}`,
          });
        });
      });
      data._migTalleresNov26Semana1 = true;
      changed = true;
    }
    // Resuelve el duplicado: el calendario fisico ya habia sincronizado solo
    // estos mismos talleres (ej. "Cheesecake" sin foto/precio) ANTES de que
    // la migracion de arriba agregara su version completa ("Cheesecakes
    // Horneados" con foto, descripcion y precio) — misma sede/fecha/horario,
    // dos sesiones distintas. Aqui se fusionan: la sesion vieja (la que ya
    // existia, con su slug e inscritos si los tiene) se queda, se le rellena
    // SOLO lo que le faltaba (nunca pisa un dato que el equipo ya haya
    // puesto a mano), se le pasan los inscritos de la duplicada nueva (por si
    // alguien alcanzo a registrarse en los minutos que estuvo viva), y la
    // duplicada se borra. Si no hay exactamente una sesion vieja que
    // coincida (0 o mas de 1), no se toca nada — mejor dejar el duplicado
    // visible que fusionar a ciegas.
    if (!data._migTalleresNov26Semana1Fusion) {
      // Palabra clave que debe aparecer en el titulo de la sesion vieja para
      // considerarla "la misma" — no basta con sede+fecha, porque varios
      // talleres MIOS de este mismo lote comparten sede/fecha/horario (ej.
      // Cheesecakes y Chocolateria el mismo jueves por la manana en
      // Nativitas: son dos talleres distintos en paralelo, no un duplicado).
      const CLAVES_NOV26_S1 = [
        { slug: 'cheesecakes-horneados', clave: 'cheesecake' },
        { slug: 'cheesecakes-horneados-2', clave: 'cheesecake' },
        { slug: 'chocolateria-basica', clave: 'chocolat' },
        { slug: 'chocolateria-basica-2', clave: 'chocolat' },
        { slug: 'velas-comestibles', clave: 'vela' },
        { slug: 'velas-comestibles-2', clave: 'vela' },
        { slug: 'aguas-michoacanas', clave: 'agua' },
        { slug: 'aguas-michoacanas-2', clave: 'agua' },
        { slug: 'tablas-de-charcuteria', clave: 'charcuter' },
        { slug: 'carnitas', clave: 'carnita' },
        { slug: 'galletas-ny', clave: 'galleta' },
        { slug: 'galletas-ny-2', clave: 'galleta' },
        { slug: 'tiramisu-douyin', clave: 'tiramis' },
        { slug: 'tiramisu-douyin-2', clave: 'tiramis' },
      ];
      const SLUGS_NOV26_S1 = new Set(CLAVES_NOV26_S1.map((c) => c.slug));
      const normalizar = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      CLAVES_NOV26_S1.forEach(({ slug, clave }) => {
        const mia = data.sesionesTaller.find((s) => s.slug === slug);
        if (!mia) return; // ya se fusiono y se borro en una vuelta anterior
        const candidatos = data.sesionesTaller.filter((s) => s.id !== mia.id
          && !SLUGS_NOV26_S1.has(s.slug) && s.sedeId === mia.sedeId && s.fecha === mia.fecha
          && normalizar(s.titulo).includes(clave));
        if (candidatos.length !== 1) return; // 0 o ambiguo (>1): no se toca
        const original = candidatos[0];
        if (!original.fotoUrl && mia.fotoUrl) original.fotoUrl = mia.fotoUrl;
        if (!original.descripcion && mia.descripcion) original.descripcion = mia.descripcion;
        if (!original.queAprendes && mia.queAprendes) original.queAprendes = mia.queAprendes;
        if (!original.precioTotal) original.precioTotal = mia.precioTotal;
        if (!original.anticipo) original.anticipo = mia.anticipo;
        if (original.cupoMaximo == null) original.cupoMaximo = mia.cupoMaximo;
        (data.inscripcionesTaller || []).forEach((i) => {
          if (i.sesionTallerId === mia.id) i.sesionTallerId = original.id;
        });
        data.sesionesTaller = data.sesionesTaller.filter((s) => s.id !== mia.id);
      });
      data._migTalleresNov26Semana1Fusion = true;
      changed = true;
    }
    // Migra el antiguo muro unico de comunidad (sin publicacion) a una
    // publicacion "General" para no perder los mensajes ya escritos.
    const mensajesSinPublicacion = (data.mensajesComunidad || []).filter((m) => !m.publicacionId);
    if (mensajesSinPublicacion.length) {
      const publicacionGeneral = {
        id: nextId(data.publicacionesComunidad),
        titulo: 'General',
        texto: 'Publicación general de la comunidad.',
        imagen: '',
        imagenNombre: null,
        createdAt: new Date().toISOString(),
      };
      data.publicacionesComunidad.push(publicacionGeneral);
      mensajesSinPublicacion.forEach((m) => { m.publicacionId = publicacionGeneral.id; });
      changed = true;
    }
    // Crea el producto "Recetario del mes" ($100), para que cualquiera lo
    // compre en /inicio sin necesidad de membresia. Su archivo se mantiene
    // sincronizado con el que se sube en /admin > Membresia (mismo PDF que
    // reciben los miembros gratis) cada vez que se actualiza ahi.
    if (!data.products.find((p) => p.slug === 'recetario-del-mes')) {
      const item = {
        id: nextId(data.products),
        orden: data.products.length,
        categoria: 'ebook',
        etiqueta: 'Regalo del mes',
        destacado: '',
        titulo: 'Recetario del mes',
        subtitulo: '',
        descripcionCorta: 'El recetario de regalo de este mes — gratis con tu membresía, o disponible aquí por separado.',
        descripcionLarga: '',
        bullets: [],
        precio: '100',
        precioAnterior: '',
        precioMembresia: '',
        boton: 'Quiero el recetario',
        imagen: '',
        galeria: [],
        archivo: data.contenidoMembresia.recetarioUrl || '',
        archivoNombre: data.contenidoMembresia.recetarioNombre || '',
        slug: 'recetario-del-mes',
        productosRelacionados: [],
        esPaquete: false,
        ocultoEnCatalogo: true,
      };
      data.products.push(item);
      changed = true;
    }
    if (changed) await persistirAhora();
  } else {
    data = datosPorDefecto();
    await pool.query('INSERT INTO app_data (id, data) VALUES (1, $1)', [JSON.stringify(data)]);
  }
  console.log('[store] Datos cargados desde PostgreSQL.');
}

function load() {
  if (!data) {
    throw new Error('[store] Los datos todavia no se han cargado (falta llamar a init antes de usar el store).');
  }
  return data;
}

function save() {
  colaEscritura = colaEscritura
    .then(() => persistirAhora())
    .catch((e) => console.error('[store] No se pudo guardar en la base de datos:', e.message));
}

function flush() {
  return colaEscritura;
}

function nextId(list) {
  return list.reduce((max, item) => Math.max(max, item.id), 0) + 1;
}

function slugify(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function slugUnico(base, productos, excludeId) {
  let slug = slugify(base) || 'producto';
  let intento = slug;
  let n = 2;
  while (productos.some((p) => p.slug === intento && p.id !== excludeId)) {
    intento = `${slug}-${n}`;
    n += 1;
  }
  return intento;
}

// Misma logica que el temporizador del sitio (public/*.html): calcula la
// fecha (YYYY-MM-DD) de la proxima ocurrencia de la clase en vivo segun el
// dia de la semana y hora configurados. Se usa para saber a que sesion
// especifica corresponde un cobro — cada semana es una fecha distinta.
// fechaEspecifica (YYYY-MM-DD) es para transmisiones de fecha suelta, que
// no caen en un dia fijo de la semana: si viene, manda sobre el calculo
// semanal de abajo.
function proximaFechaClaseISO(diaSemana, hora, fechaEspecifica) {
  if (fechaEspecifica) return fechaEspecifica;
  const ahora = new Date();
  const d = new Date(ahora);
  const [hh, mm] = String(hora || '19:00').split(':').map((n) => parseInt(n, 10) || 0);
  d.setHours(hh, mm, 0, 0);
  const dia = Math.min(6, Math.max(0, parseInt(diaSemana, 10) || 0));
  const diasAlObjetivo = (dia - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + diasAlObjetivo);
  if (d <= ahora) d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
}

// Suma (o actualiza) un contacto a la lista de campañas de correo masivo.
// La usan tanto la importacion manual por CSV como cada formulario del sitio
// que capture un correo con consentimiento para promociones, para que esos
// registros sirvan para algo mas que quedarse guardados sin usarse. Regresa
// true si se agrego, false si ya existia (y se actualizo), o null si el
// correo no era valido.
function upsertContactoCampana(data, { email, nombre, telefono, etiquetas }) {
  const correo = String(email || '').trim().toLowerCase();
  if (!correo || !correo.includes('@')) return null;
  const nuevasEtiquetas = Array.isArray(etiquetas) ? etiquetas.filter(Boolean) : [];
  const existente = data.contactosCampana.find((c) => c.email === correo);
  if (existente) {
    if (nombre) existente.nombre = String(nombre).trim();
    if (telefono) existente.telefono = String(telefono).trim();
    if (!Array.isArray(existente.etiquetas)) existente.etiquetas = [];
    nuevasEtiquetas.forEach((e) => { if (!existente.etiquetas.includes(e)) existente.etiquetas.push(e); });
    return false;
  }
  data.contactosCampana.push({
    id: nextId(data.contactosCampana),
    email: correo,
    nombre: String(nombre || '').trim(),
    telefono: String(telefono || '').trim(),
    etiquetas: nuevasEtiquetas,
    activo: true,
    unsubToken: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  });
  return true;
}

// Reemplaza la etiqueta de segmento de un contacto (quita cualquier
// "segmento:*" anterior y pone la nueva), para que al reclasificar a
// alguien no se acumulen etiquetas viejas contradictorias.
function reemplazarEtiquetaSegmento(data, email, nuevaEtiqueta) {
  const correo = String(email || '').trim().toLowerCase();
  const contacto = data.contactosCampana.find((c) => c.email === correo);
  if (!contacto) return;
  if (!Array.isArray(contacto.etiquetas)) contacto.etiquetas = [];
  contacto.etiquetas = contacto.etiquetas.filter((e) => !e.startsWith('segmento:'));
  if (nuevaEtiqueta) contacto.etiquetas.push(nuevaEtiqueta);
}

// Temas de interes que puede marcar quien se registra a la clase gratis en
// sala (opcional, sirve para decidir el tema de las siguientes clases).
const TEMAS_CLASE_GRATIS = ['panaderia', 'chocolate', 'reposteria', 'velas', 'cocina_salada'];

// Los 32 estados de la Republica Mexicana, para formularios de registro que
// piden de donde es quien se inscribe (sirve para campañas dirigidas por
// zona). Se guarda tal cual (con acentos) porque es lo que se ve en listas
// y exports; la etiqueta de campañas usa una version sin acentos/minusculas
// (ver etiquetaEstado abajo).
const ESTADOS_MEXICO = [
  'Aguascalientes', 'Baja California', 'Baja California Sur', 'Campeche', 'Chiapas', 'Chihuahua',
  'Ciudad de México', 'Coahuila', 'Colima', 'Durango', 'Estado de México', 'Guanajuato', 'Guerrero',
  'Hidalgo', 'Jalisco', 'Michoacán', 'Morelos', 'Nayarit', 'Nuevo León', 'Oaxaca', 'Puebla',
  'Querétaro', 'Quintana Roo', 'San Luis Potosí', 'Sinaloa', 'Sonora', 'Tabasco', 'Tamaulipas',
  'Tlaxcala', 'Veracruz', 'Yucatán', 'Zacatecas',
];

// Los talleres presenciales solo corren en estos dos bloques fijos — ni el
// formulario de admin ni ninguna importacion aceptan otro horario.
const HORARIOS_VALIDOS_TALLER = ['10:00 am – 2:00 pm', '4:00 pm – 8:00 pm'];

// Para pasar cualquier texto (estado o pais) a una etiqueta de campañas
// filtrable: minusculas y sin acentos (ej. "Querétaro" -> "queretaro").
function slugZona(texto) {
  return String(texto || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Las pestañas de "Inscritos 2026" de la sede División del Norte siempre
// terminan en " div" (ver docs/google-sheets.md) — mismo criterio que usa
// automatizacionesTaller.js para adivinar la pestaña si no se fijo una.
function esSedeDivision(nombreSede) {
  return /divisi[oó]n/i.test(String(nombreSede || ''));
}

// Slug url-friendly para la pagina publica de cada taller (/talleres/<slug>):
// minusculas, sin acentos, espacios y caracteres raros convertidos a guion.
function slugificar(texto) {
  return String(texto || '').trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Genera un slug unico dentro de sesionesTaller (le agrega un numero si ya
// existe), ignorando el propio id cuando se esta editando una sesion que ya
// tenia ese slug.
function slugUnicoSesionTaller(data, base, idAIgnorar) {
  const limpio = slugificar(base) || 'taller';
  const usados = new Set(
    data.sesionesTaller.filter((s) => s.id !== idAIgnorar).map((s) => s.slug).filter(Boolean)
  );
  let slug = limpio;
  let n = 2;
  while (usados.has(slug)) {
    slug = `${limpio}-${n}`;
    n += 1;
  }
  return slug;
}

// Cupo restante de un taller = cupo maximo configurado, menos las
// inscripciones YA PAGADAS (a peticion del dueño del sitio: un pago nada
// mas iniciado — "pendiente", ej. alguien que elige OXXO/SPEI y tarda en
// pagar, o que abandona el checkout a medio camino — ya NO aparta lugar;
// el cupo solo se ocupa cuando el pago se hace efectivo). Si no se
// configuro cupoMaximo (null, talleres de antes de este campo), regresa
// null = "sin limite todavia", para no bloquear nada hasta que el admin lo
// configure.
function cupoRestanteTaller(data, sesionTallerId) {
  const sesion = data.sesionesTaller.find((s) => s.id === Number(sesionTallerId));
  if (!sesion || sesion.cupoMaximo === null || sesion.cupoMaximo === undefined) return null;
  const ocupados = data.inscripcionesTaller.filter(
    (i) => i.sesionTallerId === Number(sesionTallerId) && i.estadoPago === 'pagado'
  ).length;
  return Math.max(0, sesion.cupoMaximo - ocupados);
}

// Etiqueta de campañas a partir del pais/estado de un registro, para poder
// filtrar contactos por zona en la pestaña de Campañas (ej. "estado:jalisco"
// o "pais:estados-unidos"). Si esDeMexico es undefined (registros de antes
// de este campo), no se sabe la zona: no se manda ninguna etiqueta.
function etiquetasZona({ esDeMexico, estado, pais }) {
  if (esDeMexico === undefined) return [];
  if (!esDeMexico) {
    const slug = slugZona(pais);
    return [`pais:${slug || 'otro'}`];
  }
  const slug = slugZona(estado);
  return ['pais:mexico', ...(slug ? [`estado:${slug}`] : [])];
}

// Segmento que le toca a cada registrado de la clase gratis segun lo que se
// marca al cierre del dia (asistencia + compra real), cruzando registro con
// lo que de verdad paso. "Se hizo miembro" manda sobre todo lo demas porque
// esa persona sale de las promociones y entra a la comunicacion del club.
function segmentoClaseGratis({ asistio, compro, seHizoMiembro }) {
  if (seHizoMiembro) return 'se_hizo_miembro';
  if (asistio === true && compro) return 'asistio_compro';
  if (asistio === true) return 'asistio_no_compro';
  if (asistio === false) return 'no_asistio';
  return '';
}

// Identifica la sesion de chat/presencia de la clase en vivo: mientras haya
// un video de YouTube publicado, el chat se liga a ese video (no solo a la
// fecha), asi cada transmision nueva arranca con su propio chat en cuanto el
// admin pega el link nuevo, sin depender de que tambien actualice la fecha a
// mano. Sin video activo (antes de que empiece o ya archivada) usa la fecha.
function claveSesionClaseEnVivo(youtubeId, fecha) {
  return youtubeId ? `yt:${youtubeId}` : fecha;
}

module.exports = {
  init,
  flush,
  UPLOAD_DIR,
  proximaFechaClaseEnVivo: proximaFechaClaseISO,
  claveSesionClaseEnVivo,

  getAnnouncements(onlyPublished = false) {
    const data = load();
    const items = [...data.announcements].sort((a, b) => b.id - a.id);
    return onlyPublished ? items.filter((a) => a.published) : items;
  },
  addAnnouncement({ title, body, published }) {
    const data = load();
    const item = {
      id: nextId(data.announcements),
      title,
      body,
      published: published !== false,
      createdAt: new Date().toISOString(),
    };
    data.announcements.push(item);
    save(data);
    return item;
  },
  updateAnnouncement(id, patch) {
    const data = load();
    const item = data.announcements.find((a) => a.id === Number(id));
    if (!item) return null;
    if (typeof patch.title === 'string') item.title = patch.title;
    if (typeof patch.body === 'string') item.body = patch.body;
    if (typeof patch.published === 'boolean') item.published = patch.published;
    save(data);
    return item;
  },
  deleteAnnouncement(id) {
    const data = load();
    data.announcements = data.announcements.filter((a) => a.id !== Number(id));
    save(data);
  },

  getMedia() {
    const data = load();
    return [...data.media].sort((a, b) => b.id - a.id);
  },
  addMedia({ kind, source, url, title, filename }) {
    const data = load();
    const item = {
      id: nextId(data.media),
      kind,
      source,
      url,
      title: title || '',
      filename: filename || null,
      userId: null,
      nombreAutor: '',
      estado: 'aprobado',
      createdAt: new Date().toISOString(),
    };
    data.media.push(item);
    save(data);
    return item;
  },
  // Foto que sube un cliente para la galeria publica: se publica de
  // inmediato (aparece en /galeria sin esperar aprobacion). El admin
  // conserva el control desde /admin para borrarla despues si hace falta.
  addMediaCliente({ userId, nombreAutor, url, title, filename }) {
    const data = load();
    const item = {
      id: nextId(data.media),
      kind: 'photo',
      source: 'upload',
      url,
      title: title || '',
      filename: filename || null,
      userId: userId || null,
      nombreAutor: String(nombreAutor || '').trim(),
      estado: 'aprobado',
      createdAt: new Date().toISOString(),
    };
    data.media.push(item);
    save(data);
    return item;
  },
  updateMedia(id, patch) {
    const data = load();
    const item = data.media.find((m) => m.id === Number(id));
    if (!item) return null;
    if (typeof patch.estado === 'string') item.estado = patch.estado;
    if (typeof patch.title === 'string') item.title = patch.title;
    save(data);
    return item;
  },
  deleteMedia(id) {
    const data = load();
    const item = data.media.find((m) => m.id === Number(id));
    data.media = data.media.filter((m) => m.id !== Number(id));
    data.comentariosGaleria = (data.comentariosGaleria || []).filter((c) => c.mediaId !== Number(id));
    save(data);
    return item;
  },

  getComentariosGaleria(mediaId) {
    const data = load();
    return (data.comentariosGaleria || [])
      .filter((c) => c.mediaId === Number(mediaId))
      .sort((a, b) => a.id - b.id);
  },
  addComentarioGaleria({ mediaId, userId, nombre, texto, fotoAutor }) {
    const data = load();
    data.comentariosGaleria = data.comentariosGaleria || [];
    const item = {
      id: nextId(data.comentariosGaleria),
      mediaId: Number(mediaId),
      userId: userId || null,
      nombre: String(nombre || '').trim(),
      texto: String(texto || '').trim(),
      fotoAutor: fotoAutor || '',
      createdAt: new Date().toISOString(),
    };
    data.comentariosGaleria.push(item);
    save(data);
    return item;
  },
  deleteComentarioGaleria(id) {
    const data = load();
    const item = (data.comentariosGaleria || []).find((c) => c.id === Number(id));
    data.comentariosGaleria = (data.comentariosGaleria || []).filter((c) => c.id !== Number(id));
    save(data);
    return item || null;
  },

  // ---- Secretos que el propio servidor consigue y guarda ----
  // (por ejemplo el permiso permanente de Google Ads, que se obtiene con un
  // clic del duenio de la cuenta y no se puede escribir a mano en Railway).
  getSecreto(clave) {
    const data = load();
    return (data.secretos && data.secretos[clave]) || null;
  },
  setSecreto(clave, valor) {
    const data = load();
    if (!data.secretos) data.secretos = {};
    if (valor === null || valor === undefined) delete data.secretos[clave];
    else data.secretos[clave] = valor;
    save(data);
    return valor;
  },

  // ---- Membresia mensual ($100 MXN, recetario + video de taller + lectura de eBooks) ----
  getContenidoMembresia() {
    return load().contenidoMembresia;
  },
  updateContenidoMembresia(patch) {
    const data = load();
    Object.assign(data.contenidoMembresia, patch);
    save(data);
    return data.contenidoMembresia;
  },

  // ---- Cobros de la membresia (para el registro contable en /admin > Ventas) ----
  getMembresiaPagos() {
    return [...load().membresiaPagos].sort((a, b) => b.id - a.id);
  },
  getMembresiaPagoPorAuthorizedId(mpAuthorizedPaymentId) {
    return load().membresiaPagos.find((p) => p.mpAuthorizedPaymentId === String(mpAuthorizedPaymentId)) || null;
  },
  addMembresiaPago({ userId, email, nombre, monto, estado, mpAuthorizedPaymentId, mpPaymentId, fecha }) {
    const data = load();
    const item = {
      id: nextId(data.membresiaPagos),
      userId: userId || null,
      email: email || '',
      nombre: nombre || '',
      monto,
      estado,
      mpAuthorizedPaymentId: String(mpAuthorizedPaymentId),
      mpPaymentId: mpPaymentId ? String(mpPaymentId) : '',
      createdAt: fecha || new Date().toISOString(),
    };
    data.membresiaPagos.push(item);
    save(data);
    return item;
  },

  // ---- Contenido general del sitio (clave/valor) ----
  getContent() {
    return load().content;
  },
  updateContent(patch) {
    const data = load();
    Object.keys(patch).forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(data.content, key) && typeof patch[key] === 'string') {
        data.content[key] = patch[key];
      }
    });
    save(data);
    return data.content;
  },

  // ---- Productos de la tienda ----
  getProducts() {
    const data = load();
    return [...data.products].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  },
  getProduct(id) {
    return load().products.find((p) => p.id === Number(id)) || null;
  },
  getProductBySlug(slug) {
    return load().products.find((p) => p.slug === slug) || null;
  },
  addProduct(fields) {
    const data = load();
    const item = {
      id: nextId(data.products),
      orden: data.products.length,
      categoria: 'ebook',
      etiqueta: '',
      destacado: '',
      titulo: '',
      subtitulo: '',
      descripcionCorta: '',
      descripcionLarga: '',
      bullets: [],
      precio: '',
      precioAnterior: '',
      precioMembresia: '',
      boton: 'Comprar',
      imagen: '',
      galeria: [],
      archivo: '',
      archivoNombre: '',
      slug: '',
      productosRelacionados: [],
      esPaquete: false,
      ocultoEnCatalogo: false,
      ...fields,
    };
    item.slug = slugUnico(item.slug || item.titulo, data.products, item.id);
    data.products.push(item);
    save(data);
    return item;
  },
  updateProduct(id, patch) {
    const data = load();
    const item = data.products.find((p) => p.id === Number(id));
    if (!item) return null;
    if (typeof patch.slug === 'string' && patch.slug.trim()) {
      patch = { ...patch, slug: slugUnico(patch.slug, data.products, item.id) };
    } else if (Object.prototype.hasOwnProperty.call(patch, 'slug')) {
      // vacío: no se toca el slug existente para no romper ligas ya publicadas
      patch = { ...patch };
      delete patch.slug;
    }
    Object.assign(item, patch);
    save(data);
    return item;
  },
  deleteProduct(id) {
    const data = load();
    const item = data.products.find((p) => p.id === Number(id));
    data.products = data.products.filter((p) => p.id !== Number(id));
    save(data);
    return item;
  },

  // ---- Blog de recetas gratuitas (contenido SEO, entrada a la tienda/membresia) ----
  getBlogPosts(soloPublicados) {
    const data = load();
    let items = [...data.blogPosts].sort((a, b) => b.id - a.id);
    if (soloPublicados) items = items.filter((p) => p.publicado);
    return items;
  },
  getBlogPost(id) {
    return load().blogPosts.find((p) => p.id === Number(id)) || null;
  },
  getBlogPostBySlug(slug) {
    return load().blogPosts.find((p) => p.slug === slug) || null;
  },
  addBlogPost(fields) {
    const data = load();
    const item = {
      id: nextId(data.blogPosts),
      titulo: '',
      resumen: '',
      contenido: '',
      imagen: '',
      imagenNombre: '',
      productoRelacionadoId: null,
      publicado: false,
      slug: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...fields,
    };
    item.slug = slugUnico(item.slug || item.titulo, data.blogPosts, item.id);
    data.blogPosts.push(item);
    save(data);
    return item;
  },
  updateBlogPost(id, patch) {
    const data = load();
    const item = data.blogPosts.find((p) => p.id === Number(id));
    if (!item) return null;
    if (typeof patch.slug === 'string' && patch.slug.trim()) {
      patch = { ...patch, slug: slugUnico(patch.slug, data.blogPosts, item.id) };
    } else if (Object.prototype.hasOwnProperty.call(patch, 'slug')) {
      // vacío: no se toca el slug existente para no romper ligas ya publicadas
      patch = { ...patch };
      delete patch.slug;
    }
    Object.assign(item, patch, { updatedAt: new Date().toISOString() });
    save(data);
    return item;
  },
  deleteBlogPost(id) {
    const data = load();
    const item = data.blogPosts.find((p) => p.id === Number(id));
    data.blogPosts = data.blogPosts.filter((p) => p.id !== Number(id));
    save(data);
    return item || null;
  },

  addProductoGaleriaImagen(id, { url, filename }) {
    const data = load();
    const item = data.products.find((p) => p.id === Number(id));
    if (!item) return null;
    if (!Array.isArray(item.galeria)) item.galeria = [];
    item.galeria.push({ id: nextId(item.galeria), url, filename: filename || null });
    save(data);
    return item;
  },
  deleteProductoGaleriaImagen(id, imagenId) {
    const data = load();
    const item = data.products.find((p) => p.id === Number(id));
    if (!item) return null;
    const eliminada = (item.galeria || []).find((g) => g.id === Number(imagenId));
    item.galeria = (item.galeria || []).filter((g) => g.id !== Number(imagenId));
    save(data);
    return eliminada || null;
  },

  // ---- Cursos y talleres ----
  getCursos() {
    const data = load();
    return [...data.cursos].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  },
  getCurso(id) {
    return load().cursos.find((c) => c.id === Number(id)) || null;
  },
  addCurso(fields) {
    const data = load();
    const item = {
      id: nextId(data.cursos),
      orden: data.cursos.length,
      modalidad: '',
      titulo: '',
      descripcion: '',
      precio: '',
      ...fields,
    };
    data.cursos.push(item);
    save(data);
    return item;
  },
  updateCurso(id, patch) {
    const data = load();
    const item = data.cursos.find((c) => c.id === Number(id));
    if (!item) return null;
    Object.assign(item, patch);
    save(data);
    return item;
  },
  deleteCurso(id) {
    const data = load();
    const item = data.cursos.find((c) => c.id === Number(id));
    data.cursos = data.cursos.filter((c) => c.id !== Number(id));
    save(data);
    return item;
  },

  // ---- Carrusel de imágenes del inicio (publicidad) ----
  getHeroCarrusel() {
    const data = load();
    return [...data.heroCarrusel].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  },
  addHeroCarruselImagen({ url, filename, titulo }) {
    const data = load();
    const item = {
      id: nextId(data.heroCarrusel),
      orden: data.heroCarrusel.length,
      url,
      filename: filename || null,
      titulo: titulo || '',
      createdAt: new Date().toISOString(),
    };
    data.heroCarrusel.push(item);
    save(data);
    return item;
  },
  updateHeroCarruselImagen(id, patch) {
    const data = load();
    const item = data.heroCarrusel.find((m) => m.id === Number(id));
    if (!item) return null;
    if (typeof patch.titulo === 'string') item.titulo = patch.titulo;
    save(data);
    return item;
  },
  deleteHeroCarruselImagen(id) {
    const data = load();
    const item = data.heroCarrusel.find((m) => m.id === Number(id));
    data.heroCarrusel = data.heroCarrusel.filter((m) => m.id !== Number(id));
    save(data);
    return item;
  },

  // ---- Promos semanales de talleres (carrusel de anuncios) ----
  getPromosTaller() {
    const data = load();
    return [...data.promosTaller].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  },
  addPromoTaller({ url, filename, titulo, descripcion }) {
    const data = load();
    const item = {
      id: nextId(data.promosTaller),
      orden: data.promosTaller.length,
      url,
      filename: filename || null,
      titulo: titulo || '',
      descripcion: descripcion || '',
      createdAt: new Date().toISOString(),
    };
    data.promosTaller.push(item);
    save(data);
    return item;
  },
  updatePromoTaller(id, patch) {
    const data = load();
    const item = data.promosTaller.find((m) => m.id === Number(id));
    if (!item) return null;
    if (typeof patch.titulo === 'string') item.titulo = patch.titulo;
    if (typeof patch.descripcion === 'string') item.descripcion = patch.descripcion;
    if (typeof patch.url === 'string') item.url = patch.url;
    if (typeof patch.filename === 'string' || patch.filename === null) item.filename = patch.filename;
    save(data);
    return item;
  },
  deletePromoTaller(id) {
    const data = load();
    const item = data.promosTaller.find((m) => m.id === Number(id));
    data.promosTaller = data.promosTaller.filter((m) => m.id !== Number(id));
    save(data);
    return item;
  },

  // ---- Pedidos (Mercado Pago) ----
  getOrders() {
    const data = load();
    return [...data.orders].sort((a, b) => b.id - a.id);
  },
  getOrder(id) {
    return load().orders.find((o) => o.id === Number(id)) || null;
  },
  addOrder({ items, total, email, userId, viewToken, fbp, fbc, gclid, gbraid, wbraid }) {
    const data = load();
    const item = {
      id: nextId(data.orders),
      items,
      total,
      email: email || '',
      userId: userId || null,
      estado: 'pendiente',
      mpPreferenceId: null,
      mpPaymentId: null,
      descargaToken: null,
      viewToken: viewToken || null,
      fbp: fbp || null,
      fbc: fbc || null,
      gclid: gclid || null,
      gbraid: gbraid || null,
      wbraid: wbraid || null,
      capiPurchaseEnviado: false,
      googleAdsEnviado: false,
      correoEnviado: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    data.orders.push(item);
    save(data);
    return item;
  },
  updateOrder(id, patch) {
    const data = load();
    const item = data.orders.find((o) => o.id === Number(id));
    if (!item) return null;
    Object.assign(item, patch, { updatedAt: new Date().toISOString() });
    save(data);
    return item;
  },
  getOrdersByUser(userId, email) {
    const data = load();
    const correo = (email || '').toLowerCase();
    return data.orders
      .filter((o) => o.userId === Number(userId) || (correo && (o.email || '').toLowerCase() === correo))
      .sort((a, b) => b.id - a.id);
  },

  // ---- Cobro por acceso a una clase en vivo (una sesion en especifico) ----
  // "fecha" identifica la sesion (la del proximo dia/hora configurados en
  // Contenido general): quien paga solo tiene acceso a ESA fecha, no a las
  // siguientes semanas — cada sesion nueva vuelve a cobrar si el admin deja
  // el interruptor encendido.
  tieneAccesoClaseEnVivo({ fecha, userId }) {
    if (!userId) return false;
    return load().accesosClaseEnVivo.some(
      (a) => a.fecha === fecha && a.userId === Number(userId)
    );
  },
  addAccesoClaseEnVivo({ fecha, userId, email, monto, orderId }) {
    const data = load();
    const item = {
      id: nextId(data.accesosClaseEnVivo),
      fecha,
      userId: userId || null,
      email: email || '',
      monto: monto || 0,
      orderId: orderId || null,
      createdAt: new Date().toISOString(),
    };
    data.accesosClaseEnVivo.push(item);
    save(data);
    return item;
  },

  // ---- Chat en vivo de la clase (una sesion en especifico, misma "fecha"
  // que identifica el acceso de pago) ----
  getChatClaseEnVivo(fecha) {
    return load()
      .chatClaseEnVivo.filter((m) => m.fecha === fecha)
      .sort((a, b) => a.id - b.id);
  },
  addMensajeChatClaseEnVivo({ fecha, userId, nombre, texto }) {
    const data = load();
    const item = {
      id: nextId(data.chatClaseEnVivo),
      fecha,
      userId: userId || null,
      nombre: (nombre || 'Alguien').trim().slice(0, 60),
      texto: String(texto || '').trim().slice(0, 500),
      createdAt: new Date().toISOString(),
    };
    data.chatClaseEnVivo.push(item);
    save(data);
    return item;
  },
  deleteMensajeChatClaseEnVivo(id) {
    const data = load();
    const item = data.chatClaseEnVivo.find((m) => m.id === Number(id));
    data.chatClaseEnVivo = data.chatClaseEnVivo.filter((m) => m.id !== Number(id));
    save(data);
    return item || null;
  },

  // ---- Cuentas de clientes ----
  getUserByEmail(email) {
    const correo = String(email || '').trim().toLowerCase();
    if (!correo) return null;
    return load().users.find((u) => u.email === correo) || null;
  },
  getUserById(id) {
    return load().users.find((u) => u.id === Number(id)) || null;
  },
  getUsers() {
    return [...load().users];
  },
  getUserByPreapprovalId(preapprovalId) {
    if (!preapprovalId) return null;
    return load().users.find((u) => u.membresiaPreapprovalId === preapprovalId) || null;
  },
  addUser({ email, passwordHash, nombre, telefono }) {
    const data = load();
    const item = {
      id: nextId(data.users),
      email: String(email).trim().toLowerCase(),
      passwordHash,
      nombre: nombre || '',
      telefono: telefono || '',
      fotoPerfilUrl: '',
      membresiaEstado: 'ninguna',
      membresiaPreapprovalId: '',
      membresiaActivaDesde: '',
      membresiaPrimeraActivacion: '',
      registroRecordatorioEnviado: false,
      createdAt: new Date().toISOString(),
    };
    data.users.push(item);
    upsertContactoCampana(data, { email: item.email, nombre: item.nombre, telefono: item.telefono });
    save(data);
    return item;
  },
  updateUser(id, patch) {
    const data = load();
    const item = data.users.find((u) => u.id === Number(id));
    if (!item) return null;
    Object.assign(item, patch);
    save(data);
    return item;
  },
  // Borra la cuenta (login/membresia) pero deja intacto su historial de
  // pedidos y cobros de membresia para la contabilidad — esos registros ya
  // guardan el correo por separado, no dependen de que el usuario exista.
  deleteUser(id) {
    const data = load();
    const item = data.users.find((u) => u.id === Number(id));
    if (!item) return null;
    data.users = data.users.filter((u) => u.id !== Number(id));
    save(data);
    return item;
  },

  // ---- Suscriptores del correo (footer) ----
  getSubscribers() {
    return [...load().subscribers].sort((a, b) => b.id - a.id);
  },
  addSubscriber(email) {
    const data = load();
    const correo = String(email || '').trim().toLowerCase();
    const existente = data.subscribers.find((s) => s.email === correo);
    if (existente) return { item: existente, nuevo: false };
    const item = {
      id: nextId(data.subscribers),
      email: correo,
      leadMagnetPaso: 0,
      leadMagnetProximoEnvio: null,
      unsubToken: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    data.subscribers.push(item);
    // Suscribirse al correo ya es en si mismo el consentimiento para
    // recibir campañas, asi que tambien alimenta esa lista.
    upsertContactoCampana(data, { email: item.email });
    save(data);
    return { item, nuevo: true };
  },
  updateSubscriber(id, patch) {
    const data = load();
    const item = data.subscribers.find((s) => s.id === Number(id));
    if (!item) return null;
    Object.assign(item, patch);
    save(data);
    return item;
  },
  // Se usa desde el link "dejar de recibir correos" al final de cada correo
  // del lead magnet: el token evita que cualquiera pueda dar de baja el
  // correo de otra persona solo adivinando su id.
  desuscribirSubscriberPorToken(id, token) {
    const data = load();
    const item = data.subscribers.find((s) => s.id === Number(id) && s.unsubToken === token);
    if (!item) return null;
    data.subscribers = data.subscribers.filter((s) => s.id !== Number(id));
    save(data);
    return item;
  },
  // Suscriptores a los que toca mandarles el siguiente correo de la
  // secuencia del lead magnet (paso 0 = receta gratis, ya se manda al
  // momento de suscribirse; 1-3 = nutricion hacia la membresia).
  getSubscribersParaLeadMagnet() {
    const data = load();
    const ahora = new Date().toISOString();
    return (data.subscribers || []).filter(
      (s) => s.leadMagnetProximoEnvio && s.leadMagnetProximoEnvio <= ahora
    );
  },
  // Cuentas que se registraron pero nunca se hicieron miembros, a los N
  // dias de crear la cuenta (y todavia no se les mando el recordatorio).
  getUsuariosParaRecordatorioMembresia(diasEspera) {
    const data = load();
    const limite = new Date(Date.now() - diasEspera * 24 * 60 * 60 * 1000).toISOString();
    return (data.users || []).filter(
      (u) => !u.registroRecordatorioEnviado && u.membresiaEstado !== 'activa' && u.createdAt <= limite
    );
  },

  // ---- Sedes (para el calendario de talleres presenciales) ----
  getSedes() {
    return [...load().sedes].sort((a, b) => a.id - b.id);
  },
  addSede(nombre) {
    const data = load();
    const item = {
      id: nextId(data.sedes),
      nombre: String(nombre || '').trim(),
      imagenFondo: '',
      // Para la futura pagina publica /talleres/<slug> ("sede con mapa"):
      // direccion en texto libre + un link de Google Maps listo para abrir.
      direccion: '',
      mapaLink: '',
    };
    data.sedes.push(item);
    save(data);
    return item;
  },
  updateSede(id, patch) {
    const data = load();
    const item = data.sedes.find((s) => s.id === Number(id));
    if (!item) return null;
    if (typeof patch.nombre === 'string') item.nombre = patch.nombre.trim();
    if (typeof patch.imagenFondo === 'string') item.imagenFondo = patch.imagenFondo;
    if (typeof patch.direccion === 'string') item.direccion = patch.direccion.trim();
    if (typeof patch.mapaLink === 'string') item.mapaLink = patch.mapaLink.trim();
    save(data);
    return item;
  },
  deleteSede(id) {
    const data = load();
    data.sedes = data.sedes.filter((s) => s.id !== Number(id));
    data.sesionesTaller = data.sesionesTaller.filter((s) => s.sedeId !== Number(id));
    save(data);
  },

  // ---- Calendario de talleres presenciales ----
  // Cada sesion es "el Taller": ademas de fecha/sede/horario, desde aqui se
  // configura el precio, el anticipo y el cupo real para la futura pagina
  // publica por slug (/talleres/<slug>) y el checkout con Mercado Pago.
  getSesionesTaller(sedeId) {
    const data = load();
    let items = [...data.sesionesTaller];
    if (sedeId) items = items.filter((s) => s.sedeId === Number(sedeId));
    return items
      .sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.orden ?? 0) - (b.orden ?? 0))
      .map((s) => ({ ...s, cupoRestante: cupoRestanteTaller(data, s.id) }));
  },
  getSesionTallerPorSlug(slug) {
    const data = load();
    const item = data.sesionesTaller.find((s) => s.slug === slug);
    if (!item) return null;
    return { ...item, cupoRestante: cupoRestanteTaller(data, item.id) };
  },
  addSesionTaller({ sedeId, fecha, titulo, estado, horario, descripcion, queAprendes, fotoUrl, precioTotal, anticipo, cupoMaximo, hojaSheets }) {
    const data = load();
    const mismaFecha = data.sesionesTaller.filter((s) => s.sedeId === Number(sedeId) && s.fecha === fecha);
    const sede = data.sedes.find((s) => s.id === Number(sedeId));
    const tituloLimpio = String(titulo || '').trim();
    const item = {
      id: nextId(data.sesionesTaller),
      sedeId: Number(sedeId),
      fecha,
      titulo: tituloLimpio,
      estado: estado || 'disponible',
      horario: String(horario || '').trim(),
      orden: mismaFecha.length,
      slug: slugUnicoSesionTaller(data, titulo),
      descripcion: String(descripcion || '').trim(),
      queAprendes: String(queAprendes || '').trim(),
      fotoUrl: String(fotoUrl || '').trim(),
      precioTotal: Number(precioTotal) || 0,
      anticipo: Number(anticipo) || 0,
      // null = sin limite configurado todavia (no bloquea inscripciones,
      // para no romper sesiones que se crearon antes de este campo).
      cupoMaximo: cupoMaximo === '' || cupoMaximo == null ? null : Number(cupoMaximo) || 0,
      // Nombre de la pestaña en el Sheet "Inscritos 2026": por defecto el
      // titulo del taller (sin el numero del slug, que solo existe para que
      // la URL sea unica) mas " div" si la sede es Division del Norte — se
      // puede corregir aqui si la pestaña real se llama distinto (ver
      // docs/google-sheets.md).
      hojaSheets: String(hojaSheets || '').trim() || `${tituloLimpio}${esSedeDivision(sede && sede.nombre) ? ' div' : ''}`,
    };
    data.sesionesTaller.push(item);
    save(data);
    return item;
  },
  updateSesionTaller(id, patch) {
    const data = load();
    const item = data.sesionesTaller.find((s) => s.id === Number(id));
    if (!item) return null;
    if (typeof patch.titulo === 'string') {
      item.titulo = patch.titulo;
      // El slug no se recalcula solo porque cambio el titulo (romperia
      // links ya compartidos) — solo si lo piden explicitamente.
    }
    if (typeof patch.slug === 'string' && patch.slug.trim()) {
      item.slug = slugUnicoSesionTaller(data, patch.slug, item.id);
    }
    if (typeof patch.estado === 'string') item.estado = patch.estado;
    if (typeof patch.fecha === 'string') item.fecha = patch.fecha;
    if (typeof patch.horario === 'string') item.horario = patch.horario;
    if (typeof patch.descripcion === 'string') item.descripcion = patch.descripcion;
    if (typeof patch.queAprendes === 'string') item.queAprendes = patch.queAprendes;
    if (typeof patch.fotoUrl === 'string') item.fotoUrl = patch.fotoUrl;
    if (typeof patch.hojaSheets === 'string') item.hojaSheets = patch.hojaSheets.trim();
    if (patch.precioTotal !== undefined) item.precioTotal = Number(patch.precioTotal) || 0;
    if (patch.anticipo !== undefined) item.anticipo = Number(patch.anticipo) || 0;
    if (patch.cupoMaximo !== undefined) {
      item.cupoMaximo = patch.cupoMaximo === '' || patch.cupoMaximo === null ? null : Number(patch.cupoMaximo) || 0;
    }
    save(data);
    return item;
  },
  deleteSesionTaller(id) {
    const data = load();
    data.sesionesTaller = data.sesionesTaller.filter((s) => s.id !== Number(id));
    save(data);
  },
  // Talleres "fantasma": titulo que es solo un numero de 1 o 2 digitos — la
  // huella de un bug ya corregido en el lector del calendario fisico (una
  // fila de numeros de dia de fin de mes, ej. "26,27,28,29,30,31,1", se leia
  // mal como nombres de taller). Se exponen aparte (sin borrar solos) para
  // que se puedan revisar antes de borrarlos de verdad.
  getSesionesTallerConTituloInvalido() {
    return this.getSesionesTaller().filter((s) => /^\d{1,2}$/.test(String(s.titulo || '').trim()));
  },
  borrarSesionesTallerPorId(ids) {
    const idsNum = new Set((ids || []).map(Number));
    const data = load();
    const antes = data.sesionesTaller.length;
    data.sesionesTaller = data.sesionesTaller.filter((s) => !idsNum.has(s.id));
    save(data);
    return { borradas: antes - data.sesionesTaller.length };
  },
  // Vista previa + borrado de un rango de fechas del calendario (para
  // recuperarse de datos mal importados, ej. el bug de fin de mes ya
  // corregido en syncCalendarioTalleres.js). NUNCA borra una sesion que ya
  // tenga alguna inscripcion ligada (pagada o no) — esas quedan
  // "protegidas" para revisar a mano, por si hay una venta real de por
  // medio. Pensado para usarse junto con sincronizarCalendarioFisico():
  // borrar el rango sucio y volver a sincronizar, ya con el lector
  // corregido, recrea las sesiones limpias solas.
  getResumenRangoSesionesTaller(desde, hasta) {
    const data = load();
    const sedesPorId = new Map(data.sedes.map((s) => [s.id, s]));
    const conInscripcion = new Set(data.inscripcionesTaller.map((i) => i.sesionTallerId));
    const enRango = data.sesionesTaller
      .filter((s) => s.fecha >= desde && s.fecha <= hasta)
      .map((s) => ({ ...s, sede: (sedesPorId.get(s.sedeId) || {}).nombre || '' }));
    return {
      protegidas: enRango.filter((s) => conInscripcion.has(s.id)),
      borrables: enRango.filter((s) => !conInscripcion.has(s.id)),
    };
  },
  borrarSesionesTallerEnRango(desde, hasta) {
    const data = load();
    const conInscripcion = new Set(data.inscripcionesTaller.map((i) => i.sesionTallerId));
    const antes = data.sesionesTaller.length;
    data.sesionesTaller = data.sesionesTaller.filter((s) => {
      const enRango = s.fecha >= desde && s.fecha <= hasta;
      return !(enRango && !conInscripcion.has(s.id));
    });
    save(data);
    return { borradas: antes - data.sesionesTaller.length };
  },
  // Da de alta varias sesiones de un jalon: pegadas a mano desde /admin
  // ("Importar calendario de un mes") o leidas solas del calendario fisico
  // en Google Sheets (ver src/syncCalendarioTalleres.js). Si la sede no
  // existe todavia, se crea sola. Si ya existe una sesion identica (misma
  // sede + fecha + titulo), se salta — nunca se duplica ni se toca una que
  // ya existia (para no arriesgar inscripciones/pagos ya hechos), asi que
  // es seguro correrlo mas de una vez sobre la misma lista, a mano o solo
  // todos los dias.
  importarSesionesTaller(filas, { precioTotal, anticipo, cupoMaximo } = {}) {
    const sedesExistentes = this.getSedes();
    const sedesPorNombre = new Map(sedesExistentes.map((s) => [slugZona(s.nombre), s]));
    const sesionesExistentes = this.getSesionesTaller();

    const creadas = [];
    const saltadas = [];
    const errores = [];

    (filas || []).forEach((fila, i) => {
      const sedeNombre = String(fila.sede || '').trim();
      const fecha = String(fila.fecha || '').trim();
      const titulo = String(fila.titulo || '').trim();
      const horarioPedido = String(fila.horario || '').trim().toLowerCase();
      const horario = horarioPedido === 'tarde' ? HORARIOS_VALIDOS_TALLER[1] : HORARIOS_VALIDOS_TALLER[0];

      if (!sedeNombre || !/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !titulo) {
        errores.push(`Fila ${i + 1}: falta sede, fecha (AAAA-MM-DD) o título.`);
        return;
      }

      let sede = sedesPorNombre.get(slugZona(sedeNombre));
      if (!sede) {
        sede = this.addSede(sedeNombre);
        sedesPorNombre.set(slugZona(sede.nombre), sede);
      }

      const yaExiste = sesionesExistentes.some(
        (s) => s.sedeId === sede.id && s.fecha === fecha && slugZona(s.titulo) === slugZona(titulo)
      );
      if (yaExiste) {
        saltadas.push(`${sedeNombre} · ${fecha} · ${titulo} (ya existía)`);
        return;
      }

      const nueva = this.addSesionTaller({
        sedeId: sede.id,
        fecha,
        titulo,
        horario,
        estado: 'disponible',
        precioTotal: precioTotal ?? 0,
        anticipo: anticipo ?? 0,
        cupoMaximo: cupoMaximo ?? null,
      });
      sesionesExistentes.push(nueva);
      creadas.push(`${sedeNombre} · ${fecha} · ${titulo}`);
    });

    return { creadas, saltadas, errores };
  },

  // El calendario fisico sincroniza SOLO (cada 30 min, ver
  // automatizacionesTaller.js) y compara titulos EXACTOS (slugZona) para no
  // duplicar — pero el nombre corto que Manuel escribe a mano en su Excel
  // (ej. "Cheesecake") casi nunca es identico al nombre completo con el que
  // se dio de alta el taller aqui (ej. "Cheesecakes Horneados"), asi que
  // cada sincronizacion puede volver a crear una sesion corta y vacia (sin
  // foto ni descripcion) al lado de la buena. Esto se llama DESPUES de cada
  // sincronizacion (mismo ciclo): por sede+fecha+palabra clave en el titulo
  // (nunca sede+fecha solamente, porque varios talleres de este lote
  // comparten horario en la misma sede) encuentra TODAS las sesiones de
  // cada taller, se queda con la que ya tenga foto (o la crea si de plano
  // no hay ninguna) y fusiona el resto en esa — para que sea el mismo
  // resultado sin importar cual sesion sobrevivio en pasadas anteriores.
  asegurarTalleresNov26S1() {
    const data = load();
    const SEED_DIR_TALLERES = path.join(__dirname, '..', 'seed-archivos', 'talleres-nov26-s1');
    const normalizar = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const sedePorNombre = (nombre) => (data.sedes || []).find((s) => normalizar(s.nombre).includes(nombre));
    const sedeNativitas = sedePorNombre('nativitas');
    const sedeDivision = sedePorNombre('division');
    const copiarImagen = (archivo) => {
      const origen = path.join(SEED_DIR_TALLERES, archivo);
      if (!fs.existsSync(origen)) return '';
      const destino = `${crypto.randomUUID()}${path.extname(archivo)}`;
      fs.copyFileSync(origen, path.join(UPLOAD_DIR, destino));
      return `/uploads/${destino}`;
    };
    const HORARIO_MANANA = '10:00 am – 2:00 pm';
    const HORARIO_TARDE = '4:00 pm – 8:00 pm';
    const DEFINICIONES_NOV26_S1 = [
      {
        sede: sedeNativitas, clave: 'cheesecake', titulo: 'Cheesecakes Horneados',
        fechas: ['2026-11-05', '2026-11-07'], horario: HORARIO_MANANA, imagen: 'cheesecake.jpg',
        descripcion: 'El cheesecake horneado, cremoso y sin una sola grieta. New York clásico, zarzamora con compota casera y estilo tortuga. Base firme, batido sin aire y horneado a baño maría. Taller presencial de 4 horas, para principiantes.',
        queAprendes: 'Preparas 3 cheesecakes: New York Clásico, Zarzamora con mermelada natural y Estilo Tortuga. Además aprendes la base de galleta firme, el batido sin aire, el horneado a baño maría sin grietas, y el enfriado, desmolde y conservación.',
      },
      {
        sede: sedeNativitas, clave: 'chocolat', titulo: 'Chocolatería Básica',
        fechas: ['2026-11-05', '2026-11-07'], horario: HORARIO_MANANA, imagen: 'chocolate.jpg',
        descripcion: 'El chocolate se trabaja con técnica, no con suerte. Trufas, rocas, enjambres y tortugas. Más el fundido sin errores y una ganache que no se corta. Taller presencial de 4 horas, para principiantes.',
        queAprendes: 'Preparas trufas, rocas, enjambres y tortugas. Además aprendes a distinguir cobertura real de sucedáneo, el fundido controlado sin quemar el chocolate, la ganache (emulsión estable y proporciones), qué hacer si se corta el chocolate, y conservación y empaque.',
      },
      {
        sede: sedeNativitas, clave: 'vela', titulo: 'Velas Comestibles',
        fechas: ['2026-11-06', '2026-11-08'], horario: HORARIO_MANANA, imagen: 'velas.jpg',
        descripcion: 'Parece una vela. Se enciende. Y se come. Tres velas comestibles: de mantequilla, de chocolate y de frutos rojos. Con mecha comestible y control de flama. Taller presencial de 4 horas, para principiantes.',
        queAprendes: 'Preparas 3 velas comestibles: base de mantequilla, base de chocolate y de frutos rojos. Además aprendes mecha comestible y control de flama, estabilización de la grasa, decoración de cada vela, y conservación y cadena de frío.',
      },
      {
        sede: sedeNativitas, clave: 'agua', titulo: 'Aguas Michoacanas',
        fechas: ['2026-11-06', '2026-11-08'], horario: HORARIO_MANANA, imagen: 'aguas.jpg',
        descripcion: 'El agua fresca que no se pone aguada ni se va al fondo. 14 aguas: 8 clásicas estilo Michoacana y 6 gourmet de autor. Más el punto de dulzor de la base, contando el hielo. Taller presencial de 4 horas, para principiantes.',
        queAprendes: 'Preparas 14 aguas: horchata, jamaica, limón con chía, tamarindo, fresa con leche, melón, piña colada y mango con chile (clásicas), más jamaica con lavanda, pepino con menta y limón, piña con albahaca y jengibre, guayaba con flor de jamaica, maracuyá con hierbabuena y coco tostado con vainilla (gourmet). Además aprendes el punto de dulzor contando el hielo, que la fruta no se vaya al fondo ni se oxide, y conservación de cada agua.',
      },
      {
        sede: sedeNativitas, clave: 'charcuter', titulo: 'Tablas de Charcutería',
        fechas: ['2026-11-07'], horario: HORARIO_TARDE, imagen: 'charcuteria.jpg',
        descripcion: 'La tabla que se roba la reunión. Rosas de charcutería, plisados en abanico, geometría en quesos y zonificación para que luzca llena. Taller vespertino de 4 horas, para principiantes.',
        queAprendes: 'Armas tu propia tabla de 15x25 cm con rosas de charcutería, plisados en abanico, geometría en quesos y zonificación estética. Además aprendes elección de quesos y carnes frías, corte de quesos según su textura, y conservación y empaque para llevar.',
      },
      {
        sede: sedeNativitas, clave: 'carnita', titulo: 'Carnitas',
        fechas: ['2026-11-08'], horario: HORARIO_MANANA, imagen: 'carnitas.jpg',
        descripcion: 'Carnitas doradas por fuera y jugosas por dentro. La receta completa, más las salsas y los nopales que las acompañan. Taller presencial de 4 horas, para principiantes.',
        queAprendes: 'Preparas carnitas completas, las salsas que las acompañan y nopales. Además aprendes selección de cortes, manejo de grasa y temperatura, el punto dorado sin resecar la carne, y conservación.',
      },
      {
        sede: sedeDivision, clave: 'galleta', titulo: 'Galletas NY',
        fechas: ['2026-11-05', '2026-11-07'], horario: HORARIO_MANANA, imagen: 'galletasny.jpg',
        descripcion: 'La galleta gruesa estilo Nueva York, con el centro suave. Cinco rellenas: conejito de chocolate, red velvet, volcán de chocolate y avellana, caramelo especiado y carrot cake. Masa que no se extiende, reposo en frío y el punto exacto de horneado. Taller presencial de 4 horas, para principiantes.',
        queAprendes: 'Preparas 5 galletas rellenas: conejito de chocolate, corazón red velvet, volcán de chocolate y avellana, caramelo especiado y carrot cake. Además aprendes la masa que no se extiende en el horno, reposo en frío y porcionado, el punto de horneado para un centro suave, y conservación y empaque.',
      },
      {
        sede: sedeDivision, clave: 'tiramis', titulo: 'Tiramisú Douyin',
        fechas: ['2026-11-06', '2026-11-08'], horario: HORARIO_MANANA, imagen: 'tiramisu.jpg',
        descripcion: 'El tiramisú que está arrasando en redes. Cuatro sabores: mango, frutos rojos, cookies and cream y pistacho. En molde, con capas visibles. Taller presencial de 4 horas, para principiantes.',
        queAprendes: 'Preparas tiramisú en 4 sabores: mango, frutos rojos, cookies and cream y pistacho. Además aprendes crema estable que no se escurre, capas visibles y parejas en molde, remojo justo de la base, y conservación en frío.',
      },
    ];
    let cambios = 0;
    DEFINICIONES_NOV26_S1.forEach((def) => {
      if (!def.sede) return; // sede no encontrada: no crea nada a ciegas
      def.fechas.forEach((fecha) => {
        const encontradas = data.sesionesTaller.filter((s) => s.sedeId === def.sede.id && s.fecha === fecha
          && normalizar(s.titulo).includes(def.clave));
        // Sobreviviente: la que ya tenga foto; si ninguna, la de titulo mas
        // largo (la version rica siempre es mas descriptiva que la del
        // calendario fisico, ej. "Tablas de Charcutería" vs "Tablas
        // Charcuteria"); si sigue empatado, la mas vieja (id mas chico).
        let sobreviviente = encontradas.find((s) => s.fotoUrl)
          || [...encontradas].sort((a, b) => b.titulo.length - a.titulo.length || a.id - b.id)[0];
        if (!sobreviviente) {
          const mismaFecha = data.sesionesTaller.filter((s) => s.sedeId === def.sede.id && s.fecha === fecha);
          sobreviviente = {
            id: nextId(data.sesionesTaller),
            sedeId: def.sede.id,
            fecha,
            titulo: def.titulo,
            estado: 'disponible',
            horario: def.horario,
            orden: mismaFecha.length,
            slug: slugUnicoSesionTaller(data, def.titulo),
            descripcion: '',
            queAprendes: '',
            fotoUrl: '',
            precioTotal: 0,
            anticipo: 0,
            cupoMaximo: null,
            hojaSheets: `${def.titulo}${esSedeDivision(def.sede.nombre) ? ' div' : ''}`,
          };
          data.sesionesTaller.push(sobreviviente);
          cambios += 1;
        }
        // Si sobrevivio la version corta del calendario fisico (ej.
        // "Tablas Charcuteria"), se sube de nivel al titulo completo — solo
        // hacia arriba, nunca se acorta un titulo que el equipo ya haya
        // dejado igual o mas largo a mano.
        if (sobreviviente.titulo.length < def.titulo.length) { sobreviviente.titulo = def.titulo; cambios += 1; }
        if (!sobreviviente.fotoUrl) { sobreviviente.fotoUrl = copiarImagen(def.imagen); cambios += 1; }
        if (!sobreviviente.descripcion) { sobreviviente.descripcion = def.descripcion; cambios += 1; }
        if (!sobreviviente.queAprendes) { sobreviviente.queAprendes = def.queAprendes; cambios += 1; }
        if (!sobreviviente.precioTotal) { sobreviviente.precioTotal = 1149; cambios += 1; }
        if (!sobreviviente.anticipo) { sobreviviente.anticipo = 400; cambios += 1; }
        if (sobreviviente.cupoMaximo == null) { sobreviviente.cupoMaximo = 20; cambios += 1; }
        encontradas.filter((s) => s.id !== sobreviviente.id).forEach((dup) => {
          (data.inscripcionesTaller || []).forEach((i) => {
            if (i.sesionTallerId === dup.id) i.sesionTallerId = sobreviviente.id;
          });
          data.sesionesTaller = data.sesionesTaller.filter((s) => s.id !== dup.id);
          cambios += 1;
        });
      });
    });
    if (cambios) save(data);
    return cambios;
  },

  // Solo lectura: para sacar el link real de cada uno de los 14 (8
  // talleres x fecha) de la campaña de noviembre semana 1, sin adivinar el
  // slug (puede haber sobrevivido el de la sesion creada por el calendario
  // fisico o el de la creada aqui). Mismo criterio sede+fecha+clave que
  // asegurarTalleresNov26S1, pero sin tocar nada.
  getLinksTalleresNov26S1() {
    const data = load();
    const normalizar = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const sedePorNombre = (nombre) => (data.sedes || []).find((s) => normalizar(s.nombre).includes(nombre));
    const sedeNativitas = sedePorNombre('nativitas');
    const sedeDivision = sedePorNombre('division');
    const DEF = [
      { sede: sedeNativitas, clave: 'cheesecake', titulo: 'Cheesecakes Horneados', fechas: ['2026-11-05', '2026-11-07'] },
      { sede: sedeNativitas, clave: 'chocolat', titulo: 'Chocolatería Básica', fechas: ['2026-11-05', '2026-11-07'] },
      { sede: sedeNativitas, clave: 'vela', titulo: 'Velas Comestibles', fechas: ['2026-11-06', '2026-11-08'] },
      { sede: sedeNativitas, clave: 'agua', titulo: 'Aguas Michoacanas', fechas: ['2026-11-06', '2026-11-08'] },
      { sede: sedeNativitas, clave: 'charcuter', titulo: 'Tablas de Charcutería', fechas: ['2026-11-07'] },
      { sede: sedeNativitas, clave: 'carnita', titulo: 'Carnitas', fechas: ['2026-11-08'] },
      { sede: sedeDivision, clave: 'galleta', titulo: 'Galletas NY', fechas: ['2026-11-05', '2026-11-07'] },
      { sede: sedeDivision, clave: 'tiramis', titulo: 'Tiramisú Douyin', fechas: ['2026-11-06', '2026-11-08'] },
    ];
    const resultado = [];
    DEF.forEach((def) => {
      if (!def.sede) return;
      def.fechas.forEach((fecha) => {
        const encontradas = data.sesionesTaller.filter((s) => s.sedeId === def.sede.id && s.fecha === fecha
          && normalizar(s.titulo).includes(def.clave));
        const sesion = encontradas.find((s) => s.fotoUrl) || encontradas[0] || null;
        resultado.push({
          taller: def.titulo,
          sede: def.sede.nombre,
          fecha,
          slug: sesion ? sesion.slug : null,
          tieneFoto: !!(sesion && sesion.fotoUrl),
          otrasEnElMismoSlot: encontradas.length > 1 ? encontradas.length - 1 : 0,
        });
      });
    });
    return resultado;
  },

  // Pone el mismo precio/anticipo/cupo a TODAS las sesiones del calendario
  // de un jalon (a peticion del dueño del sitio: todos los talleres cuestan
  // lo mismo y tienen el mismo cupo maximo) — util para corregir de golpe
  // las que se crearon sin precio (ej. capturadas a mano antes de que
  // existiera el campo), que sin precio mandan al cliente a WhatsApp en vez
  // de dejarlo comprar en la pagina (ver irAlTaller en
  // public/calendario.html). Sobrescribe tambien las que ya tenian un valor
  // distinto, a proposito. cupoMaximo es opcional (si no se manda, no se
  // toca ese campo) para no obligar a pasar los tres valores siempre.
  fijarPrecioYAnticipoTodasLasSesiones({ precioTotal, anticipo, cupoMaximo }) {
    const data = load();
    let actualizadas = 0;
    data.sesionesTaller.forEach((s) => {
      s.precioTotal = Number(precioTotal) || 0;
      s.anticipo = Number(anticipo) || 0;
      if (cupoMaximo !== undefined && cupoMaximo !== '' && cupoMaximo !== null) {
        s.cupoMaximo = Number(cupoMaximo) || 0;
      }
      actualizadas += 1;
    });
    save(data);
    return { actualizadas };
  },

  // Fija a mano el nombre real de la pestaña de Sheets para TODAS las
  // sesiones de un taller+sede (presente y futuro) de un jalon — para
  // cuando el nombre que el sistema calcularia (titulo + " div") no
  // coincide con como el equipo nombro la pestaña de verdad (ver
  // GET /admin/api/sesiones-taller/verificar-pestanas).
  fijarHojaSheetsPorTituloYSede(titulo, sedeId, hojaSheets) {
    const data = load();
    let actualizadas = 0;
    data.sesionesTaller.forEach((s) => {
      if (s.titulo === titulo && s.sedeId === Number(sedeId)) {
        s.hojaSheets = String(hojaSheets || '').trim();
        actualizadas += 1;
      }
    });
    save(data);
    return { actualizadas };
  },

  // ---- Inscripciones a talleres (formulario publico) ----
  // Ligadas siempre a una sesion real del calendario (sesionTallerId): asi
  // taller/fecha/sede/horario nunca los escribe la persona a mano (se toman
  // del calendario que ya administra Endulcora), sin variaciones de
  // mayusculas/minusculas ni fechas inventadas. Alimenta tanto el control
  // interno (quien pago que) como la base de datos general de Levent (solo
  // contacto e interes — nunca el anticipo ni el horario, eso se filtra en
  // leventSync.js).
  getInscripcionesTaller() {
    return [...load().inscripcionesTaller].sort((a, b) => b.id - a.id);
  },
  getInscripcionTaller(id) {
    return load().inscripcionesTaller.find((i) => i.id === Number(id)) || null;
  },
  addInscripcionTaller({
    nombre, whatsapp, correo, sesionTallerId, taller, fecha, sede, horario, montoAnticipo,
    comoSeEntero, preferencias, cumpleDia, cumpleMes, esDeMexico, estado, pais,
    esPrimeraVez, aceptaPromociones, aceptaAvisoPrivacidad,
  }) {
    const data = load();
    const item = {
      id: nextId(data.inscripcionesTaller),
      nombre: String(nombre || '').trim(),
      whatsapp: String(whatsapp || '').trim(),
      correo: String(correo || '').trim().toLowerCase(),
      sesionTallerId: Number(sesionTallerId) || null,
      // Copia del calendario al momento de inscribirse: aunque la sesion se
      // edite o se borre despues, el registro conserva lo que era cierto
      // cuando esta persona se inscribio.
      taller: String(taller || '').trim(),
      fecha: String(fecha || '').trim(),
      sede: String(sede || '').trim(),
      horario: String(horario || '').trim(),
      montoAnticipo: String(montoAnticipo || '').trim(),
      comoSeEntero: String(comoSeEntero || '').trim(),
      preferencias: String(preferencias || '').trim().slice(0, 500),
      cumpleDia: Number(cumpleDia) || null,
      cumpleMes: Number(cumpleMes) || null,
      // De donde es quien se inscribe, para poder dirigir campañas por zona
      // (ver etiquetasZona, que alimenta la lista de campañas de correo).
      esDeMexico: !!esDeMexico,
      estado: esDeMexico && ESTADOS_MEXICO.includes(estado) ? estado : '',
      pais: !esDeMexico ? String(pais || '').trim().slice(0, 80) : '',
      esPrimeraVez: !!esPrimeraVez,
      aceptaPromociones: !!aceptaPromociones,
      aceptaAvisoPrivacidad: !!aceptaAvisoPrivacidad,
      // Control real del pago (Fase 1 del cobro de talleres): por ahora
      // toda inscripcion nueva entra "pendiente" sin monto, hasta que el
      // flujo de pago de la Fase 2/3 (o el admin a mano, mientras tanto) la
      // actualice. tipoPago: '' | 'anticipo' | 'completo'.
      tipoPago: '',
      montoPagado: 0,
      saldo: null,
      estadoPago: 'pendiente',
      pagoId: '',
      vencePendienteEn: null,
      // Como se cobro de verdad (Efectivo, Transferencia, TDD, Promoción...)
      // — vacio significa "en linea por Mercado Pago" (lo unico que puede
      // dejarlo vacio es el checkout del sitio; un registro manual en
      // /admin siempre trae algo aqui).
      formaPago: '',
      // Ventas extra (portal de Lex, Fase 2): materiales, ebooks y
      // membresia que se le venden a este inscrito ademas de su taller.
      ventasExtra: [],
      // Asistencia y recetario (portal de Lex, Fase 3).
      asistio: false,
      recetarioEnviado: false,
      reconocimientoEnviado: false,
      reconocimientoFolio: null,
      // Fase 4 (correos automaticos + Google Sheets): cada bandera se marca
      // una sola vez, para no mandar el mismo recordatorio dos veces ni
      // duplicar la fila en "Inscritos 2026" si el servidor se reinicia.
      recordatorio2diasEnviado: false,
      recordatorioMismoDiaEnviado: false,
      sheetsSincronizado: false,
      createdAt: new Date().toISOString(),
    };
    data.inscripcionesTaller.push(item);
    // Si acepto promociones, tambien alimenta la lista de campañas de
    // correo masivo, para que este registro sirva para algo mas que
    // quedarse guardado sin usarse.
    if (item.aceptaPromociones) {
      upsertContactoCampana(data, {
        email: item.correo,
        nombre: item.nombre,
        telefono: item.whatsapp,
        etiquetas: etiquetasZona(item),
      });
    }
    save(data);
    return item;
  },
  deleteInscripcionTaller(id) {
    const data = load();
    data.inscripcionesTaller = data.inscripcionesTaller.filter((i) => i.id !== Number(id));
    save(data);
  },
  // Marca a mano el estado del pago de una inscripcion. Mientras no exista
  // el cobro automatico por Mercado Pago (Fase 3), es como el admin
  // registra que alguien ya pago su anticipo o el total por WhatsApp.
  actualizarPagoInscripcionTaller(id, { tipoPago, montoPagado, estadoPago, pagoId, vencePendienteEn, formaPago }) {
    const data = load();
    const item = data.inscripcionesTaller.find((i) => i.id === Number(id));
    if (!item) return null;
    if (typeof tipoPago === 'string') item.tipoPago = tipoPago;
    if (montoPagado !== undefined) item.montoPagado = Number(montoPagado) || 0;
    if (typeof estadoPago === 'string') item.estadoPago = estadoPago;
    if (typeof pagoId === 'string') item.pagoId = pagoId;
    if (vencePendienteEn !== undefined) item.vencePendienteEn = vencePendienteEn;
    if (typeof formaPago === 'string') item.formaPago = formaPago;
    const sesion = data.sesionesTaller.find((s) => s.id === item.sesionTallerId);
    item.saldo = sesion && sesion.precioTotal ? Math.max(0, sesion.precioTotal - item.montoPagado) : null;
    save(data);
    return item;
  },
  // Venta extra (portal de Lex): materiales, ebooks o membresia que se le
  // venden a un inscrito ademas de su taller, en un solo ticket con su
  // propia forma de pago. No toca el pago del taller (montoPagado/saldo).
  agregarVentaExtraInscripcion(id, { items, formaPago }) {
    const data = load();
    const item = data.inscripcionesTaller.find((i) => i.id === Number(id));
    if (!item) return null;
    const lineas = (Array.isArray(items) ? items : [])
      .map((it) => ({
        concepto: String(it.concepto || '').trim(),
        precioUnitario: Math.max(0, Number(it.precioUnitario) || 0),
        cantidad: Math.max(1, Math.round(Number(it.cantidad) || 1)),
        // Si viene del selector de ebooks (no de un articulo libre o del
        // catalogo de materiales), liga la linea al producto real para
        // poder mandarle sus archivos por correo despues de guardar.
        productoId: it.productoId ? Number(it.productoId) : null,
      }))
      .filter((l) => l.concepto);
    if (!lineas.length) return null;
    if (!Array.isArray(item.ventasExtra)) item.ventasExtra = [];
    const venta = {
      id: nextId(item.ventasExtra),
      items: lineas,
      total: lineas.reduce((suma, l) => suma + l.precioUnitario * l.cantidad, 0),
      formaPago: String(formaPago || '').trim(),
      fecha: new Date().toISOString(),
    };
    item.ventasExtra.push(venta);
    save(data);
    return item;
  },
  borrarVentaExtraInscripcion(id, ventaId) {
    const data = load();
    const item = data.inscripcionesTaller.find((i) => i.id === Number(id));
    if (!item) return null;
    item.ventasExtra = (item.ventasExtra || []).filter((v) => v.id !== Number(ventaId));
    save(data);
    return item;
  },
  // Marca o quita la asistencia de un inscrito (portal de Lex). No manda
  // el recetario por si sola -- eso lo decide la ruta, que es quien tiene
  // acceso al correo (src/email.js); aqui solo se guarda el estado.
  marcarAsistenciaInscripcionTaller(id, asistio) {
    const data = load();
    const item = data.inscripcionesTaller.find((i) => i.id === Number(id));
    if (!item) return null;
    item.asistio = !!asistio;
    save(data);
    return item;
  },
  marcarRecetarioEnviado(id) {
    const data = load();
    const item = data.inscripcionesTaller.find((i) => i.id === Number(id));
    if (!item) return null;
    item.recetarioEnviado = true;
    save(data);
    return item;
  },
  marcarReconocimientoEnviado(id, folio) {
    const data = load();
    const item = data.inscripcionesTaller.find((i) => i.id === Number(id));
    if (!item) return null;
    item.reconocimientoEnviado = true;
    item.reconocimientoFolio = folio || null;
    save(data);
    return item;
  },
  // ---- Recetarios por taller (portal de Lex, Fase 3) ----
  // Uno por titulo de taller (no por fecha): se sube una vez y sirve para
  // todas las sesiones futuras de ese mismo taller, sin volver a subirlo.
  getRecetarioTaller(titulo) {
    const clave = String(titulo || '').trim().toLowerCase();
    if (!clave) return null;
    return load().recetariosTaller.find((r) => r.titulo === clave) || null;
  },
  guardarRecetarioTaller(titulo, { archivo, archivoNombre }) {
    const data = load();
    const clave = String(titulo || '').trim().toLowerCase();
    if (!clave) return null;
    let item = data.recetariosTaller.find((r) => r.titulo === clave);
    if (!item) {
      item = { titulo: clave, archivo: '', archivoNombre: '' };
      data.recetariosTaller.push(item);
    }
    item.archivo = archivo;
    item.archivoNombre = archivoNombre || '';
    item.actualizadoEn = new Date().toISOString();
    save(data);
    return item;
  },
  // Inscripciones ya pagadas, con taller en la fecha exacta buscada, a las
  // que todavia no se les manda ESE recordatorio (2 dias antes o el mismo
  // dia). Solo a quien ya pago: no tiene sentido recordarle el taller a
  // alguien que todavia no asegura su lugar.
  getInscripcionesTallerParaRecordatorio(campoBandera, fechaISO) {
    const data = load();
    return data.inscripcionesTaller.filter(
      (i) => i.estadoPago === 'pagado' && i.fecha === fechaISO && !i[campoBandera]
    );
  },
  marcarRecordatorioTallerEnviado(id, campoBandera) {
    const data = load();
    const item = data.inscripcionesTaller.find((i) => i.id === Number(id));
    if (!item) return null;
    item[campoBandera] = true;
    save(data);
    return item;
  },
  // Inscripciones (pagadas o no) que todavia no se escriben en el Google
  // Sheet "Inscritos 2026" (ver src/googleSheets.js) — TODO registro entra
  // aqui, no solo los ya pagados: asi Lex puede ver en la hoja a todo el
  // que se registro, igual que antes cuando ella lo capturaba a mano, y
  // comparar contra el estado real del pago segun la columna DEBE. Tambien
  // sirve para reintentar las que fallaron mientras no habia credenciales
  // configuradas.
  getInscripcionesTallerSinSincronizar() {
    const data = load();
    return data.inscripcionesTaller.filter((i) => !i.sheetsSincronizado);
  },
  marcarInscripcionTallerSincronizada(id) {
    const data = load();
    const item = data.inscripcionesTaller.find((i) => i.id === Number(id));
    if (!item) return null;
    item.sheetsSincronizado = true;
    save(data);
    return item;
  },

  // ---- Registro corto para el QR de captura (multistream, StreamYard) ----
  // Formulario minimo pensado para escanearse desde un celular a la mitad
  // de un live: nombre, contacto, y que marca del grupo le interesa. Se
  // suma a la base de datos general de Levent igual que los demas
  // contactos — la idea es alimentar el directorio compartido de Crenef,
  // Instituto Justo, Levent, Endulcora y lo que venga despues.
  getRegistrosQr() {
    return [...load().registrosQr].sort((a, b) => b.id - a.id);
  },
  addRegistroQr({ nombre, whatsapp, correo, marcaInteres, aceptaPromociones, aceptaAvisoPrivacidad }) {
    const data = load();
    const item = {
      id: nextId(data.registrosQr),
      nombre: String(nombre || '').trim(),
      whatsapp: String(whatsapp || '').trim(),
      correo: String(correo || '').trim().toLowerCase(),
      marcaInteres: String(marcaInteres || '').trim(),
      aceptaPromociones: !!aceptaPromociones,
      aceptaAvisoPrivacidad: !!aceptaAvisoPrivacidad,
      createdAt: new Date().toISOString(),
    };
    data.registrosQr.push(item);
    if (item.aceptaPromociones) upsertContactoCampana(data, { email: item.correo, nombre: item.nombre, telefono: item.whatsapp });
    save(data);
    return item;
  },
  deleteRegistroQr(id) {
    const data = load();
    data.registrosQr = data.registrosQr.filter((r) => r.id !== Number(id));
    save(data);
  },

  // ---- Clase gratis en sala (p.ej. Pan de Muerto): registro en el sitio +
  // segmentacion al cierre del dia, para dar seguimiento distinto a cada
  // quien segun que paso de verdad (ver clasegratis_* en el contenido para
  // la configuracion del evento: horarios, cupos, precios de la oferta).
  TEMAS_CLASE_GRATIS,
  ESTADOS_MEXICO,
  HORARIOS_VALIDOS_TALLER,
  etiquetasZona,
  getRegistrosClaseGratis() {
    return [...load().registrosClaseGratis].sort((a, b) => b.id - a.id);
  },
  addRegistroClaseGratis({ nombre, whatsapp, correo, fecha, horario, yaTomoTaller, interesTemas, esDeMexico, estado, pais, aceptaAvisoPrivacidad }) {
    const data = load();
    const item = {
      id: nextId(data.registrosClaseGratis),
      nombre: String(nombre || '').trim(),
      whatsapp: String(whatsapp || '').trim(),
      correo: String(correo || '').trim().toLowerCase(),
      // Copia de la fecha configurada al momento del registro: si mas
      // adelante se reusa este formulario para otra clase en otra fecha,
      // cada registro conserva a cual clase pertenecia de verdad.
      fecha: String(fecha || '').trim(),
      horario: String(horario || '').trim(),
      yaTomoTaller: !!yaTomoTaller,
      interesTemas: Array.isArray(interesTemas) ? interesTemas.filter((t) => TEMAS_CLASE_GRATIS.includes(t)) : [],
      // De donde es quien se registra, para poder dirigir campañas por zona
      // (ver etiquetasZona, que alimenta la lista de campañas de correo).
      esDeMexico: !!esDeMexico,
      estado: esDeMexico && ESTADOS_MEXICO.includes(estado) ? estado : '',
      pais: !esDeMexico ? String(pais || '').trim().slice(0, 80) : '',
      aceptaAvisoPrivacidad: !!aceptaAvisoPrivacidad,
      asistio: null, // null = sin marcar todavia; true/false al cierre del dia
      compro: '', // '' sin marcar, o 'taller' | 'recetario' si asistio y compro
      seHizoMiembro: false,
      segmento: '',
      // Control de aforo (ver confirmarRegistroClaseGratis): token unico
      // para el link personal del correo "confirma tu lugar".
      confirmToken: crypto.randomUUID(),
      confirmado: false,
      confirmadoEn: null,
      enListaEspera: false,
      correoConfirmarEnviado: false,
      recordatorio2diasClaseEnviado: false,
      recordatorioMismoDiaClaseEnviado: false,
      createdAt: new Date().toISOString(),
    };
    data.registrosClaseGratis.push(item);
    upsertContactoCampana(data, {
      email: item.correo,
      nombre: item.nombre,
      telefono: item.whatsapp,
      etiquetas: ['clase-gratis:pan-de-muerto', ...etiquetasZona(item)],
    });
    save(data);
    return item;
  },
  actualizarSegmentoClaseGratis(id, { asistio, compro, seHizoMiembro }) {
    const data = load();
    const item = data.registrosClaseGratis.find((r) => r.id === Number(id));
    if (!item) return null;
    if (typeof asistio === 'boolean' || asistio === null) item.asistio = asistio;
    if (typeof compro === 'string') item.compro = compro;
    if (typeof seHizoMiembro === 'boolean') item.seHizoMiembro = seHizoMiembro;
    item.segmento = segmentoClaseGratis(item);
    reemplazarEtiquetaSegmento(data, item.correo, item.segmento ? `segmento:${item.segmento}` : '');
    save(data);
    return item;
  },
  deleteRegistroClaseGratis(id) {
    const data = load();
    data.registrosClaseGratis = data.registrosClaseGratis.filter((r) => r.id !== Number(id));
    save(data);
  },

  // ---- Control de aforo de la clase gratis (correo "confirma tu lugar" +
  // tope de cupo + lista de espera) ----
  CUPO_CLASE_GRATIS_POR_HORARIO: 50,

  getRegistroClaseGratisPorToken(id, token) {
    const item = load().registrosClaseGratis.find((r) => r.id === Number(id));
    if (!item || !token || item.confirmToken !== token) return null;
    return item;
  },

  // Para el link compartido en el grupo de WhatsApp (uno solo para todos):
  // la persona escribe el correo o el whatsapp con el que se registro. Se
  // busca solo entre los registros de la fecha configurada ahora mismo,
  // para no mezclar con una clase gratis anterior si se reusa el formulario.
  buscarRegistroClaseGratisActivo(correoOTelefono) {
    const data = load();
    const buscado = String(correoOTelefono || '').trim().toLowerCase();
    if (!buscado) return null;
    const fechaActiva = data.content.clasegratis_fecha || '';
    const candidatos = data.registrosClaseGratis
      .filter((r) => r.fecha === fechaActiva)
      .filter((r) => r.correo === buscado || r.whatsapp.replace(/\D/g, '') === buscado.replace(/\D/g, ''))
      .sort((a, b) => b.id - a.id);
    return candidatos[0] || null;
  },

  contarConfirmadosClaseGratis(horario, fecha) {
    return load().registrosClaseGratis.filter((r) => r.horario === horario && r.fecha === fecha && r.confirmado).length;
  },

  // Confirma el lugar si todavia hay cupo en su horario (primero en
  // confirmar, primero en entrar); si ya no hay, lo deja en lista de
  // espera. Es idempotente: si ya estaba confirmado, no hace nada (no se
  // vuelve a contar ni se manda dos veces).
  confirmarRegistroClaseGratis(id) {
    const data = load();
    const item = data.registrosClaseGratis.find((r) => r.id === Number(id));
    if (!item) return null;
    if (item.confirmado) return { item, resultado: 'yaConfirmado' };
    const confirmados = data.registrosClaseGratis.filter(
      (r) => r.horario === item.horario && r.fecha === item.fecha && r.confirmado
    ).length;
    if (confirmados < this.CUPO_CLASE_GRATIS_POR_HORARIO) {
      item.confirmado = true;
      item.confirmadoEn = new Date().toISOString();
      item.enListaEspera = false;
      save(data);
      return { item, resultado: 'confirmado' };
    }
    item.enListaEspera = true;
    save(data);
    return { item, resultado: 'listaEspera' };
  },

  // El equipo la usa cuando alguien avisa que no va a poder ir: libera su
  // lugar (no promueve a nadie solo -- eso lo hace el admin a proposito
  // con promoverListaEsperaClaseGratis, para poder avisarle a esa persona).
  cancelarConfirmacionClaseGratis(id) {
    const data = load();
    const item = data.registrosClaseGratis.find((r) => r.id === Number(id));
    if (!item) return null;
    item.confirmado = false;
    item.confirmadoEn = null;
    save(data);
    return item;
  },

  // Toma a quien lleva mas tiempo en la lista de espera de ese horario y lo
  // confirma (si de verdad hay un lugar libre) -- el admin manda despues el
  // correo de "se libero tu lugar" con lo que regresa aqui.
  promoverListaEsperaClaseGratis(horario, fecha) {
    const data = load();
    const confirmados = data.registrosClaseGratis.filter(
      (r) => r.horario === horario && r.fecha === fecha && r.confirmado
    ).length;
    if (confirmados >= this.CUPO_CLASE_GRATIS_POR_HORARIO) return null;
    const siguiente = data.registrosClaseGratis
      .filter((r) => r.horario === horario && r.fecha === fecha && r.enListaEspera && !r.confirmado)
      .sort((a, b) => a.id - b.id)[0];
    if (!siguiente) return null;
    siguiente.confirmado = true;
    siguiente.confirmadoEn = new Date().toISOString();
    siguiente.enListaEspera = false;
    save(data);
    return siguiente;
  },

  // Para el panel de /admin: cuantos hay por horario -- registrados,
  // confirmados (contra el tope de 50) y en lista de espera.
  resumenConfirmacionesClaseGratis(fecha) {
    const data = load();
    const deEstaFecha = data.registrosClaseGratis.filter((r) => r.fecha === fecha);
    const horarios = [...new Set(deEstaFecha.map((r) => r.horario))];
    return horarios.map((horario) => {
      const delHorario = deEstaFecha.filter((r) => r.horario === horario);
      return {
        horario,
        registrados: delHorario.length,
        confirmados: delHorario.filter((r) => r.confirmado).length,
        enListaEspera: delHorario.filter((r) => r.enListaEspera && !r.confirmado).length,
        cupo: this.CUPO_CLASE_GRATIS_POR_HORARIO,
      };
    });
  },

  // ---- Envio masivo del correo "confirma tu lugar" (uno solo a la vez,
  // para esta clase) -- mismo motivo de resumibilidad que las campañas:
  // son cientos de correos, puede tardar minutos y el servidor se puede
  // reiniciar a la mitad (ej. un deploy).
  getEnvioConfirmacionClaseGratis() {
    return load().envioConfirmacionClaseGratis;
  },
  iniciarEnvioConfirmacionClaseGratis(registroIds) {
    const data = load();
    data.envioConfirmacionClaseGratis = {
      registroIds,
      enviadosIds: [],
      fallidosIds: [],
      total: registroIds.length,
      estado: 'enviando',
      ultimoError: '',
      createdAt: new Date().toISOString(),
      terminadaAt: null,
    };
    save(data);
    return data.envioConfirmacionClaseGratis;
  },
  marcarRecordatorioClaseGratisEnviado(id, campoBandera) {
    const data = load();
    const item = data.registrosClaseGratis.find((r) => r.id === Number(id));
    if (!item) return null;
    item[campoBandera] = true;
    save(data);
    return item;
  },
  registrarResultadoEnvioConfirmacionClaseGratis(id, exito, errorMsg) {
    const data = load();
    const envio = data.envioConfirmacionClaseGratis;
    if (!envio) return;
    if (exito) envio.enviadosIds.push(Number(id));
    else {
      envio.fallidosIds.push(Number(id));
      envio.ultimoError = errorMsg || '';
    }
    if (envio.enviadosIds.length + envio.fallidosIds.length >= envio.total) {
      envio.estado = 'terminada';
      envio.terminadaAt = new Date().toISOString();
    }
    save(data);
  },

  // ---- Registro gratis para ver la clase en vivo (lunes a jueves): no
  // reemplaza el acceso de quien paga o es miembro, es una puerta extra
  // para quien no tiene ninguna de las dos. Es un registro UNICO (no se
  // vuelve a pedir en cada sesion): el acceso concedido se guarda en
  // cookies de largo plazo del navegador (ver accesoClaseEnVivoDeRequest
  // en src/routes/api.js), no aqui — esta lista es solo el historial de
  // quien se registro, para campañas y reportes.
  getRegistrosVideoEnVivo() {
    return [...load().registrosVideoEnVivo].sort((a, b) => b.id - a.id);
  },
  addRegistroVideoEnVivo({ nombre, whatsapp, correo, fecha, yaTomoTaller, interesTemas, esDeMexico, estado, pais, aceptaAvisoPrivacidad }) {
    const data = load();
    const item = {
      id: nextId(data.registrosVideoEnVivo),
      nombre: String(nombre || '').trim(),
      whatsapp: String(whatsapp || '').trim(),
      correo: String(correo || '').trim().toLowerCase(),
      fecha: String(fecha || '').trim(),
      yaTomoTaller: !!yaTomoTaller,
      interesTemas: Array.isArray(interesTemas) ? interesTemas.filter((t) => TEMAS_CLASE_GRATIS.includes(t)) : [],
      esDeMexico: !!esDeMexico,
      estado: esDeMexico && ESTADOS_MEXICO.includes(estado) ? estado : '',
      pais: !esDeMexico ? String(pais || '').trim().slice(0, 80) : '',
      aceptaAvisoPrivacidad: !!aceptaAvisoPrivacidad,
      // Si de verdad tocó "ya me uní" en el paso 2 (ver
      // confirmarComunidadVideoEnVivo). Util para saber quien solo llenó el
      // formulario pero no se unió de verdad al grupo.
      comunidadConfirmada: false,
      createdAt: new Date().toISOString(),
    };
    data.registrosVideoEnVivo.push(item);
    upsertContactoCampana(data, {
      email: item.correo,
      nombre: item.nombre,
      telefono: item.whatsapp,
      etiquetas: ['video-en-vivo', ...etiquetasZona(item)],
    });
    save(data);
    return item;
  },
  // Marca el registro mas reciente de ese correo como "ya se unio a la
  // comunidad" (paso 2). Si no hay ningun registro con ese correo (ej. el
  // navegador ya traia la cookie de "registrado" pero no se mando correo
  // porque fue una visita de regreso), simplemente no hace nada — el
  // acceso de todas formas se concede por la cookie, esto es solo para
  // enriquecer el reporte.
  confirmarComunidadVideoEnVivo(correo) {
    const data = load();
    const limpio = String(correo || '').trim().toLowerCase();
    if (!limpio) return null;
    const candidatos = data.registrosVideoEnVivo.filter((r) => r.correo === limpio && !r.comunidadConfirmada);
    if (!candidatos.length) return null;
    const item = candidatos.reduce((a, b) => (a.id > b.id ? a : b));
    item.comunidadConfirmada = true;
    save(data);
    return item;
  },
  deleteRegistroVideoEnVivo(id) {
    const data = load();
    data.registrosVideoEnVivo = data.registrosVideoEnVivo.filter((r) => r.id !== Number(id));
    save(data);
  },

  // ---- Biblioteca de clases en vivo grabadas (exclusiva para miembros) ----
  getBibliotecaClases() {
    return [...load().bibliotecaClases].sort((a, b) => b.id - a.id);
  },
  addClaseBiblioteca({ titulo, descripcion, youtubeId, fecha }) {
    const data = load();
    const item = {
      id: nextId(data.bibliotecaClases),
      titulo: String(titulo || '').trim(),
      descripcion: String(descripcion || '').trim(),
      youtubeId: String(youtubeId || '').trim(),
      fecha: fecha || new Date().toISOString().slice(0, 10),
      recetarioUrl: '',
      recetarioNombre: '',
      createdAt: new Date().toISOString(),
    };
    data.bibliotecaClases.push(item);
    save(data);
    return item;
  },
  updateClaseBiblioteca(id, patch) {
    const data = load();
    const item = data.bibliotecaClases.find((c) => c.id === Number(id));
    if (!item) return null;
    Object.assign(item, patch);
    save(data);
    return item;
  },
  deleteClaseBiblioteca(id) {
    const data = load();
    data.bibliotecaClases = data.bibliotecaClases.filter((c) => c.id !== Number(id));
    save(data);
  },

  // ---- Contactos para campañas de correo masivo (lista propia, separada de
  // "subscribers"/"users") ----
  getContactosCampana() {
    return [...load().contactosCampana]
      .map((c) => (Array.isArray(c.etiquetas) ? c : { ...c, etiquetas: [] }))
      .sort((a, b) => b.id - a.id);
  },
  importarContactosCampana(lista) {
    const data = load();
    let agregados = 0;
    let actualizados = 0;
    for (const fila of lista) {
      const nuevo = upsertContactoCampana(data, fila);
      if (nuevo === null) continue;
      if (nuevo) agregados += 1;
      else actualizados += 1;
    }
    save(data);
    return { agregados, actualizados, total: data.contactosCampana.length };
  },
  deleteContactoCampana(id) {
    const data = load();
    data.contactosCampana = data.contactosCampana.filter((c) => c.id !== Number(id));
    save(data);
  },
  // Se usa desde el link "dejar de recibir correos" al final de cada
  // campaña: el token evita que cualquiera pueda desactivar el correo de
  // otra persona solo adivinando su id.
  desuscribirContactoCampanaPorToken(id, token) {
    const data = load();
    const item = data.contactosCampana.find((c) => c.id === Number(id) && c.unsubToken === token);
    if (!item) return null;
    item.activo = false;
    save(data);
    return item;
  },

  // ---- Historial de campañas de correo enviadas ----
  // Guarda el contenido completo y la lista de a quien le toca (contactoIds)
  // junto con quien ya quedo procesado (enviadosIds/fallidosIds), para poder
  // retomar el envio exactamente donde se quedo si el servidor se reinicia
  // a la mitad (ej. un deploy) en vez de perder el resto de la campaña.
  getCampanasCorreo() {
    return [...load().campanasCorreo].sort((a, b) => b.id - a.id);
  },
  getCampanaCorreo(id) {
    return load().campanasCorreo.find((c) => c.id === Number(id)) || null;
  },
  addCampanaCorreo({ asunto, cuerpoHtml, imagenes, archivos, videoUrl, botonTexto, contactoIds }) {
    const data = load();
    const item = {
      id: nextId(data.campanasCorreo),
      asunto,
      cuerpoHtml,
      imagenes: imagenes || [],
      archivos: archivos || [],
      videoUrl: videoUrl || '',
      // Texto del boton que acompaña a videoUrl -- por defecto "Ver video"
      // (lo que ya hacia antes), pero si el link no es un video (ej. la
      // pagina de compra de un taller) se puede poner otro texto.
      botonTexto: String(botonTexto || '').trim(),
      contactoIds: contactoIds || [],
      enviadosIds: [],
      fallidosIds: [],
      total: (contactoIds || []).length,
      enviados: 0,
      fallidos: 0,
      ultimoError: '',
      estado: 'enviando',
      createdAt: new Date().toISOString(),
      terminadaAt: null,
    };
    data.campanasCorreo.push(item);
    save(data);
    return item;
  },
  // Se llama una vez por cada contacto procesado, para que quede guardado de
  // inmediato quien ya recibio su correo (o fallo) y no se repita al retomar.
  registrarResultadoCampana(id, contactoId, exito, errorMsg) {
    const data = load();
    const item = data.campanasCorreo.find((c) => c.id === Number(id));
    if (!item) return null;
    if (exito) {
      item.enviadosIds.push(contactoId);
    } else {
      item.fallidosIds.push(contactoId);
      if (errorMsg) item.ultimoError = String(errorMsg);
    }
    item.enviados = item.enviadosIds.length;
    item.fallidos = item.fallidosIds.length;
    save(data);
    return item;
  },
  actualizarCampanaCorreo(id, patch) {
    const data = load();
    const item = data.campanasCorreo.find((c) => c.id === Number(id));
    if (!item) return null;
    Object.assign(item, patch);
    save(data);
    return item;
  },

  // ---- Reseñas de alumnos ----
  getResenas(onlyPublicadas = false) {
    const data = load();
    const items = [...data.resenas].sort((a, b) => b.id - a.id);
    return onlyPublicadas ? items.filter((r) => r.publicado) : items;
  },
  addResena({ userId, nombreAutor, texto, estrellas, imagen, imagenNombre, fotoAutor }) {
    const data = load();
    const item = {
      id: nextId(data.resenas),
      userId: userId || null,
      nombreAutor: String(nombreAutor || '').trim(),
      texto: String(texto || '').trim(),
      estrellas: Math.max(1, Math.min(5, Number(estrellas) || 5)),
      imagen: imagen || '',
      imagenNombre: imagenNombre || '',
      fotoAutor: fotoAutor || '',
      publicado: false,
      createdAt: new Date().toISOString(),
    };
    data.resenas.push(item);
    save(data);
    return item;
  },
  updateResena(id, patch) {
    const data = load();
    const item = data.resenas.find((r) => r.id === Number(id));
    if (!item) return null;
    if (typeof patch.publicado === 'boolean') item.publicado = patch.publicado;
    if (typeof patch.texto === 'string') item.texto = patch.texto;
    if (typeof patch.imagen === 'string') item.imagen = patch.imagen;
    if (typeof patch.imagenNombre === 'string') item.imagenNombre = patch.imagenNombre;
    save(data);
    return item;
  },
  deleteResena(id) {
    const data = load();
    const item = data.resenas.find((r) => r.id === Number(id));
    data.resenas = data.resenas.filter((r) => r.id !== Number(id));
    save(data);
    return item || null;
  },

  // ---- Comunidad: publicaciones del admin, con comentarios de clientes ----
  getPublicacionesComunidad() {
    const data = load();
    return [...data.publicacionesComunidad].sort((a, b) => b.id - a.id);
  },
  getPublicacionComunidad(id) {
    return load().publicacionesComunidad.find((p) => p.id === Number(id)) || null;
  },
  addPublicacionComunidad({ titulo, texto }) {
    const data = load();
    const item = {
      id: nextId(data.publicacionesComunidad),
      titulo: String(titulo || '').trim(),
      texto: String(texto || '').trim(),
      imagen: '',
      imagenNombre: null,
      video: '',
      videoNombre: '',
      userId: null,
      nombreAutor: '',
      fotoAutor: '',
      estado: 'aprobado',
      createdAt: new Date().toISOString(),
    };
    data.publicacionesComunidad.push(item);
    save(data);
    return item;
  },
  // Publicacion hecha por un cliente (foto o video + descripcion), como una
  // red social: se publica de inmediato (aparece en /comunidad sin esperar
  // aprobacion). El admin conserva el control desde /admin para borrarla
  // despues si hace falta.
  addPublicacionComunidadCliente({ userId, nombreAutor, fotoAutor, texto, imagen, imagenNombre, video, videoNombre }) {
    const data = load();
    const item = {
      id: nextId(data.publicacionesComunidad),
      titulo: '',
      texto: String(texto || '').trim(),
      imagen: imagen || '',
      imagenNombre: imagenNombre || null,
      video: video || '',
      videoNombre: videoNombre || '',
      userId: userId || null,
      nombreAutor: String(nombreAutor || '').trim(),
      fotoAutor: fotoAutor || '',
      estado: 'aprobado',
      createdAt: new Date().toISOString(),
    };
    data.publicacionesComunidad.push(item);
    save(data);
    return item;
  },
  updatePublicacionComunidad(id, patch) {
    const data = load();
    const item = data.publicacionesComunidad.find((p) => p.id === Number(id));
    if (!item) return null;
    if (typeof patch.titulo === 'string') item.titulo = patch.titulo;
    if (typeof patch.texto === 'string') item.texto = patch.texto;
    if (typeof patch.imagen === 'string') item.imagen = patch.imagen;
    if (typeof patch.imagenNombre === 'string' || patch.imagenNombre === null) item.imagenNombre = patch.imagenNombre;
    if (typeof patch.video === 'string') item.video = patch.video;
    if (typeof patch.videoNombre === 'string') item.videoNombre = patch.videoNombre;
    if (typeof patch.estado === 'string') item.estado = patch.estado;
    save(data);
    return item;
  },
  deletePublicacionComunidad(id) {
    const data = load();
    const item = data.publicacionesComunidad.find((p) => p.id === Number(id));
    data.publicacionesComunidad = data.publicacionesComunidad.filter((p) => p.id !== Number(id));
    data.mensajesComunidad = data.mensajesComunidad.filter((m) => m.publicacionId !== Number(id));
    save(data);
    return item || null;
  },

  getMensajesComunidad(publicacionId) {
    const data = load();
    let items = [...data.mensajesComunidad];
    if (publicacionId) items = items.filter((m) => m.publicacionId === Number(publicacionId));
    return items.sort((a, b) => a.id - b.id);
  },
  addMensajeComunidad({ publicacionId, userId, nombre, texto, imagen, imagenNombre, fotoAutor }) {
    const data = load();
    const item = {
      id: nextId(data.mensajesComunidad),
      publicacionId: Number(publicacionId),
      userId,
      nombre: String(nombre || '').trim(),
      texto: String(texto || '').trim(),
      imagen: imagen || '',
      imagenNombre: imagenNombre || '',
      fotoAutor: fotoAutor || '',
      createdAt: new Date().toISOString(),
    };
    data.mensajesComunidad.push(item);
    save(data);
    return item;
  },
  deleteMensajeComunidad(id) {
    const data = load();
    const item = data.mensajesComunidad.find((m) => m.id === Number(id));
    data.mensajesComunidad = data.mensajesComunidad.filter((m) => m.id !== Number(id));
    save(data);
    return item || null;
  },
};
