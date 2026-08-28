// Encuentra a una clienta en la base a partir del nombre que escribe Lex.
//
// Escribir el nombre completo, igualito a como quedó guardado, es pedir
// demasiado: la base tiene 3,396 personas capturadas por formularios distintos
// a lo largo de años. Lo normal es que Lex escriba "Elsa Judith Lorenzana" y en
// la base esté "Elsa Judith Lorenzana Basaldúa", o que escriba solo el nombre y
// un apellido.
//
// Por eso la comparación es por palabras y no por texto exacto, y cuando hay
// varias candidatas no se adivina: se devuelven para que Lex elija.

function normalizar(s) {
  return String(s == null ? '' : s)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Palabras que no distinguen a nadie y solo estorban al comparar.
const VACIAS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'da', 'do', 'van', 'von', 'mc']);

function palabras(nombre) {
  return normalizar(nombre).split(' ').filter((p) => p && !VACIAS.has(p));
}

/**
 * Puntúa qué tanto se parecen dos nombres, de 0 a 100.
 *
 * La regla de oro: lo que Lex escribió tiene que estar TODO dentro del nombre
 * guardado. Al revés no — si escribe menos palabras de las que hay en la base,
 * sigue siendo la misma persona. Pero si escribe una palabra que no aparece,
 * probablemente es otra.
 */
function parecido(escrito, guardado) {
  const a = palabras(escrito);
  const b = palabras(guardado);
  if (!a.length || !b.length) return 0;

  if (a.join(' ') === b.join(' ')) return 100;

  const enB = new Set(b);
  const coinciden = a.filter((p) => enB.has(p));
  const sobran = a.length - coinciden.length;

  // Una palabra escrita que no aparece en el nombre guardado descarta casi
  // siempre: suele ser un apellido distinto.
  if (sobran > 0) {
    if (a.length <= 2) return 0;
    if (sobran > 1) return 0;
    // Con 3 o más palabras se tolera una suelta (un error de dedo, por ejemplo),
    // pero baja mucho la confianza.
    return Math.round(45 * (coinciden.length / a.length));
  }

  // Todo lo escrito aparece en el nombre guardado. Entre más completo sea lo
  // que escribió, más seguro es; y se penaliza un poco que el guardado tenga
  // muchas palabras de más, porque eso abre la puerta a confusiones.
  const cobertura = coinciden.length / b.length;
  const demas = b.length - coinciden.length;
  let punto = 70 + Math.round(cobertura * 25);
  if (a.length === 1) punto -= 30;        // un solo nombre distingue poco
  punto -= Math.min(10, demas * 3);
  return Math.max(0, Math.min(99, punto));
}

/**
 * Busca a una persona entre todos los contactos.
 * Devuelve { estado, contacto, candidatas }.
 *
 *   'encontrada' -> hay una clara ganadora
 *   'ambigua'    -> varias parecidas; Lex tiene que elegir
 *   'sin-datos'  -> se encontró a la persona pero no tiene correo
 *   'no-esta'    -> nadie se le parece
 */
function buscarPersona(nombreEscrito, contactos) {
  const puntuadas = [];
  for (const c of contactos) {
    const punto = parecido(nombreEscrito, c.nombre);
    if (punto > 0) puntuadas.push({ contacto: c, punto });
  }
  puntuadas.sort((x, y) => y.punto - x.punto);

  if (!puntuadas.length) return { estado: 'no-esta', candidatas: [] };

  const mejor = puntuadas[0];
  const segunda = puntuadas[1];

  // Gana sola cuando es buena y le saca ventaja clara a la siguiente. Si dos
  // personas se llaman casi igual, es preferible preguntar que equivocarse:
  // un nombre mal puesto en un reconocimiento no se puede deshacer.
  const clara = mejor.punto >= 70 && (!segunda || mejor.punto - segunda.punto >= 12);

  if (clara) {
    if (!mejor.contacto.email) {
      return { estado: 'sin-datos', contacto: mejor.contacto, candidatas: [] };
    }
    return { estado: 'encontrada', contacto: mejor.contacto, candidatas: [] };
  }

  return {
    estado: 'ambigua',
    candidatas: puntuadas.slice(0, 5).map((p) => ({ ...p.contacto, punto: p.punto })),
  };
}

module.exports = { buscarPersona, parecido, normalizar, palabras };
