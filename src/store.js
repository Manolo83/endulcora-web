const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');
const { DATA_DIR, UPLOAD_DIR } = require('./config');

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
  clase_cupos_totales: '25',
  clase_cupos_apartados: '0',
  footer_descripcion:
    'Publicaciones y talleres para quien cocina con oficio y quiere vivir de eso. Ciudad de México, México.',
  whatsapp_numero: '5665271901',
  legal_privacidad:
    'Endulcora · Estudio Gastronómico, con domicilio en Ciudad de México, es responsable del tratamiento de tus datos personales.\n\nQué recabamos. Nombre, correo electrónico y teléfono, y los datos de facturación cuando los solicitas.\n\nPara qué. Entregar tus compras digitales, darte acceso a tus cursos, emitir comprobantes y avisarte de nuevas publicaciones. No vendemos ni compartimos tus datos con terceros ajenos a estos fines.\n\nTus derechos ARCO. Puedes acceder, rectificar, cancelar u oponerte al uso de tus datos escribiendo a nuestro WhatsApp. Respondemos en un máximo de 20 días hábiles.',
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
    users: [],
    heroCarrusel: [],
    promosTaller: [],
    subscribers: [],
    sedes: DEFAULT_SEDES.map((nombre, i) => ({ id: i + 1, nombre })),
    sesionesTaller: [],
    resenas: [],
    publicacionesComunidad: [],
    mensajesComunidad: [],
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
      if (!p.slug) {
        p.slug = slugUnico(p.titulo, data.products, p.id);
        changed = true;
      }
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
    function crearFamiliaEbookDesglosada({ tituloBase, categoria, carpetaSeed, archivos }) {
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
      const paquete = nuevoProducto(`${tituloBase} · Paquete completo`, categoria, PRECIOS_LINEA_EBOOKS.paquete, 'Comprar paquete completo', null);
      paquete.esPaquete = true;
      paquete.ocultoEnCatalogo = true;
      const ebook = nuevoProducto(tituloBase, categoria, PRECIOS_LINEA_EBOOKS.ebook, 'Agregar al carrito', archivos.ebook);
      ebook.productosRelacionados = [anexo.id, app.id, paquete.id];
    }
    const FAMILIAS_A_DESGLOSAR = [
      {
        tituloViejo: 'Galletas Tipo New York · Paquete completo',
        tituloBase: 'Galletas Tipo New York',
        categoria: 'ebook',
        carpetaSeed: 'galletas-tipo-new-york',
        archivos: { ebook: 'Endulcora_Galletas_NY_eBook.pdf', anexo: 'Endulcora_Galletas_NY_Calculadora_Costos_Merma_Precios.xlsx', app: 'Endulcora_Galletas_NY_APP.html' },
      },
      {
        tituloViejo: 'Repostería para Diabéticos · Paquete completo',
        tituloBase: 'Repostería para Diabéticos',
        categoria: 'ebook',
        carpetaSeed: 'reposteria-para-diabeticos',
        archivos: { ebook: 'Endulcora_Reposteria_Diabeticos_eBook.pdf', anexo: 'Endulcora_Reposteria_Diabeticos_Calculadora_Costos_Merma_Precios.xlsx', app: 'Endulcora_Reposteria_Diabeticos_APP.html' },
      },
      {
        tituloViejo: 'PAQUETE MAESTRO DE ROLES GOURMET',
        tituloBase: 'Roles Gourmet',
        categoria: 'ebook',
        carpetaSeed: 'roles-gourmet',
        archivos: { ebook: 'Endulcora_Roles_Gourmet_eBook.pdf', anexo: 'Endulcora_Roles_Gourmet_Calculadora_Costos_Merma_Precios.xlsx', app: 'Endulcora_Roles_Gourmet_APP.html' },
      },
      {
        // Productos nuevos, sin producto viejo que borrar.
        tituloBase: 'Tamales Oaxaqueños',
        categoria: 'ebook',
        carpetaSeed: 'tamales-oaxaquenos',
        archivos: { ebook: 'Endulcora_Tamales_Oaxaquenos_eBook.pdf', anexo: 'Endulcora_Tamales_Oaxaquenos_Calculadora_Costos_Merma_Precios.xlsx', app: 'Endulcora_Tamales_Oaxaquenos_APP.html' },
      },
      {
        tituloBase: 'Tamales Regionales',
        categoria: 'ebook',
        carpetaSeed: 'tamales-regionales',
        archivos: { ebook: 'Endulcora_Tamales_Regionales_eBook.pdf', anexo: 'Endulcora_Tamales_Regionales_Calculadora_Costos_Merma_Precios.xlsx', app: 'Endulcora_Tamales_Regionales_APP.html' },
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
      crearFamiliaEbookDesglosada(familia);
      data[flag] = true;
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

module.exports = {
  init,
  flush,
  UPLOAD_DIR,

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
      createdAt: new Date().toISOString(),
    };
    data.media.push(item);
    save(data);
    return item;
  },
  deleteMedia(id) {
    const data = load();
    const item = data.media.find((m) => m.id === Number(id));
    data.media = data.media.filter((m) => m.id !== Number(id));
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
  addOrder({ items, total, email, userId, viewToken, fbp, fbc }) {
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
      capiPurchaseEnviado: false,
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

  // ---- Cuentas de clientes ----
  getUserByEmail(email) {
    const correo = String(email || '').trim().toLowerCase();
    if (!correo) return null;
    return load().users.find((u) => u.email === correo) || null;
  },
  getUserById(id) {
    return load().users.find((u) => u.id === Number(id)) || null;
  },
  addUser({ email, passwordHash, nombre }) {
    const data = load();
    const item = {
      id: nextId(data.users),
      email: String(email).trim().toLowerCase(),
      passwordHash,
      nombre: nombre || '',
      createdAt: new Date().toISOString(),
    };
    data.users.push(item);
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

  // ---- Suscriptores del correo (footer) ----
  getSubscribers() {
    return [...load().subscribers].sort((a, b) => b.id - a.id);
  },
  addSubscriber(email) {
    const data = load();
    const correo = String(email || '').trim().toLowerCase();
    const existente = data.subscribers.find((s) => s.email === correo);
    if (existente) return existente;
    const item = { id: nextId(data.subscribers), email: correo, createdAt: new Date().toISOString() };
    data.subscribers.push(item);
    save(data);
    return item;
  },

  // ---- Sedes (para el calendario de talleres presenciales) ----
  getSedes() {
    return [...load().sedes].sort((a, b) => a.id - b.id);
  },
  addSede(nombre) {
    const data = load();
    const item = { id: nextId(data.sedes), nombre: String(nombre || '').trim(), imagenFondo: '' };
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
  getSesionesTaller(sedeId) {
    const data = load();
    let items = [...data.sesionesTaller];
    if (sedeId) items = items.filter((s) => s.sedeId === Number(sedeId));
    return items.sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.orden ?? 0) - (b.orden ?? 0));
  },
  addSesionTaller({ sedeId, fecha, titulo, estado }) {
    const data = load();
    const mismaFecha = data.sesionesTaller.filter((s) => s.sedeId === Number(sedeId) && s.fecha === fecha);
    const item = {
      id: nextId(data.sesionesTaller),
      sedeId: Number(sedeId),
      fecha,
      titulo: String(titulo || '').trim(),
      estado: estado || 'disponible',
      orden: mismaFecha.length,
    };
    data.sesionesTaller.push(item);
    save(data);
    return item;
  },
  updateSesionTaller(id, patch) {
    const data = load();
    const item = data.sesionesTaller.find((s) => s.id === Number(id));
    if (!item) return null;
    if (typeof patch.titulo === 'string') item.titulo = patch.titulo;
    if (typeof patch.estado === 'string') item.estado = patch.estado;
    if (typeof patch.fecha === 'string') item.fecha = patch.fecha;
    save(data);
    return item;
  },
  deleteSesionTaller(id) {
    const data = load();
    data.sesionesTaller = data.sesionesTaller.filter((s) => s.id !== Number(id));
    save(data);
  },

  // ---- Reseñas de alumnos ----
  getResenas(onlyPublicadas = false) {
    const data = load();
    const items = [...data.resenas].sort((a, b) => b.id - a.id);
    return onlyPublicadas ? items.filter((r) => r.publicado) : items;
  },
  addResena({ userId, nombreAutor, texto, estrellas }) {
    const data = load();
    const item = {
      id: nextId(data.resenas),
      userId: userId || null,
      nombreAutor: String(nombreAutor || '').trim(),
      texto: String(texto || '').trim(),
      estrellas: Math.max(1, Math.min(5, Number(estrellas) || 5)),
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
    save(data);
    return item;
  },
  deleteResena(id) {
    const data = load();
    data.resenas = data.resenas.filter((r) => r.id !== Number(id));
    save(data);
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
  addMensajeComunidad({ publicacionId, userId, nombre, texto }) {
    const data = load();
    const item = {
      id: nextId(data.mensajesComunidad),
      publicacionId: Number(publicacionId),
      userId,
      nombre: String(nombre || '').trim(),
      texto: String(texto || '').trim(),
      createdAt: new Date().toISOString(),
    };
    data.mensajesComunidad.push(item);
    save(data);
    return item;
  },
  deleteMensajeComunidad(id) {
    const data = load();
    data.mensajesComunidad = data.mensajesComunidad.filter((m) => m.id !== Number(id));
    save(data);
  },
};
