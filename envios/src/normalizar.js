// Limpieza de la base de contactos que sale de Google Drive.
//
// La hoja "Base de Datos Endulcora (respuestas)" acumula varias versiones del
// formulario encimadas, asi que trae columnas repetidas y datos incompletos.
// Los tres casos que hay que resolver, vistos en la hoja real:
//
//   1. "Nombre completo" a veces trae SOLO el apellido ("Basaldua"), y el
//      nombre de pila vive en otras dos columnas ("Elsa Judith" + "Lorenzana").
//   2. Los telefonos vienen en cinco formatos distintos: "5510168323",
//      "+50255756927", "55 18190332", "22 23 43 40 57".
//   3. Hay correos con errores de dedo ("...@gmail.coma", "...@oitlook.com").
//
// Aqui no se inventa nada: lo que no se puede resolver con certeza se marca
// como dudoso para que Lex o Alek lo revisen antes de mandar el reconocimiento.

const DOMINIOS_CONOCIDOS = [
  'gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'yahoo.com.mx',
  'live.com', 'live.com.mx', 'icloud.com', 'hotmail.es', 'outlook.es',
  'prodigy.net.mx', 'me.com', 'msn.com',
];

const RE_EMAIL = /^[^@\s]+@[^@\s]+\.[a-zA-Z]{2,}$/;

function normalizarTexto(s) {
  return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
}

function sinAcentos(s) {
  return normalizarTexto(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// Pone cada palabra con mayuscula inicial, respetando las particulas ("de",
// "la", "del") que en espanol van en minuscula dentro del nombre.
const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'da', 'do', 'van', 'von']);

function acomodarNombre(s) {
  const limpio = normalizarTexto(s);
  if (!limpio) return '';
  return limpio
    .split(' ')
    .map((palabra, i) => {
      const bajo = palabra.toLowerCase();
      if (i > 0 && PARTICULAS.has(bajo)) return bajo;
      return bajo.charAt(0).toUpperCase() + bajo.slice(1);
    })
    .join(' ');
}

function revisarEmail(valor) {
  const email = normalizarTexto(valor).toLowerCase();
  if (!email) return { email: '', valido: false, motivo: 'Sin correo' };
  if (!RE_EMAIL.test(email)) return { email, valido: false, motivo: 'Formato incorrecto' };

  const dominio = email.split('@')[1];
  if (DOMINIOS_CONOCIDOS.includes(dominio)) return { email, valido: true };

  // Un dominio a una letra de distancia de uno conocido casi siempre es un
  // error de dedo ("gmail.coma", "oitlook.com"). Se acepta pero se avisa.
  const parecido = DOMINIOS_CONOCIDOS.find((d) => distancia(dominio, d) <= 2);
  if (parecido) {
    return { email, valido: true, sospechoso: true, sugerencia: email.replace(dominio, parecido) };
  }
  return { email, valido: true };
}

// Distancia de edicion, para detectar dominios mal escritos.
function distancia(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 99;
  const fila = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previo = fila[0];
    fila[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = fila[j];
      fila[j] = Math.min(
        fila[j] + 1,
        fila[j - 1] + 1,
        previo + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      previo = temp;
    }
  }
  return fila[b.length];
}

// Deja el telefono en digitos y, si es mexicano de 10 digitos, lo formatea
// bonito. Los numeros de otros paises se respetan tal cual con su lada.
function normalizarTelefono(valor) {
  const crudo = normalizarTexto(valor);
  if (!crudo) return '';
  const masMx = crudo.startsWith('+') && !crudo.startsWith('+52');
  let digitos = crudo.replace(/\D/g, '');
  if (!digitos) return '';
  if (!masMx && digitos.length === 12 && digitos.startsWith('52')) digitos = digitos.slice(2);
  if (!masMx && digitos.length === 11 && digitos.startsWith('1')) digitos = digitos.slice(1);
  if (digitos.length === 10) {
    // Las ladas de 2 digitos (CDMX 55/56, Monterrey 81, Guadalajara 33) se
    // agrupan 2-4-4; el resto del pais usa lada de 3 digitos: 3-3-4.
    const ladaCorta = ['55', '56', '81', '33'].includes(digitos.slice(0, 2));
    return ladaCorta
      ? `${digitos.slice(0, 2)} ${digitos.slice(2, 6)} ${digitos.slice(6)}`
      : `${digitos.slice(0, 3)} ${digitos.slice(3, 6)} ${digitos.slice(6)}`;
  }
  return crudo.startsWith('+') ? `+${digitos}` : digitos;
}

// Localiza una columna por el texto de su encabezado. Se busca por coincidencia
// parcial sin acentos para que siga funcionando si el formulario cambia un poco
// la redaccion de la pregunta.
function buscarColumnas(encabezados, fragmento, excluir = []) {
  const f = sinAcentos(fragmento);
  const fuera = excluir.map(sinAcentos);
  const indices = [];
  encabezados.forEach((h, i) => {
    const limpio = sinAcentos(h);
    if (!limpio.includes(f)) return;
    if (fuera.some((x) => limpio.includes(x))) return;
    indices.push(i);
  });
  return indices;
}

// Columnas que dicen "nombre completo" pero NO son el nombre de la clienta.
// La de contacto de emergencia es la mas traicionera: su encabezado es
// "Contacto de emergencia (Nombre completo y numero celular)", y si se toma
// como fuente acaba imprimiendo un telefono dentro del reconocimiento.
const COLUMNAS_QUE_NO_SON_EL_NOMBRE = [
  'contacto de emergencia',
  'nombre de tu pareja',
  'nombre en facebook',
];

/**
 * Convierte las filas crudas del CSV de Drive en contactos limpios.
 * Devuelve { contactos, resumen } — resumen trae los conteos para mostrarle
 * a quien importa el archivo que fue lo que entro y que se descarto.
 */
function normalizarFilas(filas) {
  if (!filas.length) return { contactos: [], resumen: vacio() };

  const encabezados = filas[0].map(normalizarTexto);
  const cuerpo = filas.slice(1);

  const colEmail = buscarColumnas(encabezados, 'correo electronico')[0];
  const colsNombre = buscarColumnas(encabezados, 'nombre completo', COLUMNAS_QUE_NO_SON_EL_NOMBRE);
  const colApellido = buscarColumnas(encabezados, 'apellido paterno')[0];
  const colsTel = buscarColumnas(encabezados, 'whatsapp');

  const contactos = [];
  const resumen = vacio();
  resumen.filasLeidas = cuerpo.length;

  for (const fila of cuerpo) {
    const dato = (i) => (i === undefined || i < 0 ? '' : normalizarTexto(fila[i]));

    const revision = revisarEmail(dato(colEmail));
    if (!revision.email) {
      resumen.sinCorreo++;
      continue;
    }
    if (!revision.valido) {
      resumen.correoInvalido++;
      continue;
    }

    // El nombre se arma juntando las columnas que existan, sin repetir
    // palabras. Asi "Basaldua" + "Elsa Judith" + "Lorenzana" queda como
    // "Elsa Judith Lorenzana Basaldua" en vez de perderse.
    const partes = [];
    const yaVisto = new Set();
    const agregar = (texto) => {
      for (const palabra of normalizarTexto(texto).split(' ')) {
        if (!palabra) continue;
        // Un nombre no lleva digitos: descarta telefonos o folios colados.
        if (/\d/.test(palabra)) continue;
        const clave = sinAcentos(palabra);
        if (yaVisto.has(clave)) continue;
        yaVisto.add(clave);
        partes.push(palabra);
      }
    };
    // Orden: nombres de pila primero, luego apellidos.
    for (const i of colsNombre.slice(1)) agregar(dato(i));
    if (colApellido !== undefined) agregar(dato(colApellido));
    if (colsNombre.length) agregar(dato(colsNombre[0]));

    const nombre = acomodarNombre(partes.join(' '));
    if (!nombre) {
      resumen.sinNombre++;
      continue;
    }
    if (partes.length < 2) resumen.nombreIncompleto++;

    let telefono = '';
    for (const i of colsTel) {
      telefono = normalizarTelefono(dato(i));
      if (telefono) break;
    }
    if (!telefono) resumen.sinTelefono++;
    if (revision.sospechoso) resumen.correoSospechoso++;

    contactos.push({
      nombre,
      email: revision.email,
      telefono,
      origen: 'drive',
      revisar: partes.length < 2 || Boolean(revision.sospechoso),
      sugerenciaCorreo: revision.sugerencia || '',
    });
  }

  // Se juntan los registros repetidos: la misma persona aparece varias veces
  // porque se inscribio a varios talleres. Gana el nombre mas completo.
  const porEmail = new Map();
  for (const c of contactos) {
    const previo = porEmail.get(c.email);
    if (!previo) {
      porEmail.set(c.email, c);
    } else {
      resumen.repetidos++;
      if (c.nombre.length > previo.nombre.length) previo.nombre = c.nombre;
      if (!previo.telefono && c.telefono) previo.telefono = c.telefono;
      previo.revisar = previo.revisar && c.revisar;
    }
  }

  const unicos = [...porEmail.values()];
  resumen.personasUnicas = unicos.length;
  resumen.porRevisar = unicos.filter((c) => c.revisar).length;
  return { contactos: unicos, resumen };
}

function vacio() {
  return {
    filasLeidas: 0,
    personasUnicas: 0,
    repetidos: 0,
    sinCorreo: 0,
    correoInvalido: 0,
    correoSospechoso: 0,
    sinNombre: 0,
    nombreIncompleto: 0,
    sinTelefono: 0,
    porRevisar: 0,
  };
}

module.exports = { normalizarFilas, normalizarTelefono, acomodarNombre, revisarEmail };
