// Revisor del copy contra la política de Atributos Personales de Meta.
//
// Es la razón número uno por la que rechazan los anuncios de una clínica. La
// regla es simple de decir y fácil de romper sin querer: el anuncio NO puede
// dar a entender que ya sabes algo de la salud de quien lo está viendo.
//
//   Se rechaza:  "¿Sufres de ansiedad?"        (le atribuyes la condición)
//                "Tu hijo tiene autismo..."     (das por hecho su diagnóstico)
//                "¿Te duele la espalda?"        (pregunta sobre su cuerpo)
//
//   Se aprueba:  "En Crenef acompañamos a personas con ansiedad."
//                "Terapia de lenguaje para niños con autismo."
//                "Fisioterapia para dolor de espalda."
//
// El truco que siempre funciona: habla de lo que la clínica hace y de a quién
// atiende, en tercera persona. Nunca de lo que la persona "tiene" o "sufre".
//
// Meta tampoco permite prometer resultados médicos ni usar imágenes de
// "antes y después", así que también los avisamos.

// Padecimientos y condiciones que suelen aparecer en anuncios de clínicas.
// No pretende ser exhaustiva: cubre lo que más se usa en México.
const CONDICIONES = [
  'ansiedad', 'depresi[oó]n', 'estr[eé]s', 'insomnio', 'autismo', 'asperger',
  'tdah', 'd[eé]ficit de atenci[oó]n', 'dislexia', 'discalculia', 'tartamudez',
  'trastorno\\w*', 'discapacidad', 'par[aá]lisis', 'secuelas', 'lesi[oó]n',
  'fractura', 'hernia', 'artritis', 'escoliosis', 'dolor(?:es)?', 'migra[ñn]a',
  'obesidad', 'sobrepeso', 'diabetes', 'hipertensi[oó]n', 'adicci[oó]n',
  'retraso', 'problemas? de (?:lenguaje|aprendizaje|conducta|memoria)',
  'bullying', 'duelo', 'demencia', 'alzheimer', 'p[aá]rkinson',
].join('|');

// Verbos y formas en segunda persona que "acusan" a quien ve el anuncio.
const SEGUNDA_PERSONA = 'sufres|padeces|tienes|sientes|est[aá]s|te sientes|te duele|vives con|luchas con|eres';

const REGLAS = [
  {
    tipo: 'atributo-personal',
    // "¿Sufres de ansiedad?", "¿Tienes dolor de espalda?"
    patron: new RegExp(`\\b(?:${SEGUNDA_PERSONA})\\b[^.?!]{0,40}\\b(?:${CONDICIONES})\\b`, 'gi'),
    mensaje:
      'Le atribuye la condición a quien ve el anuncio. Cámbialo a tercera persona: ' +
      'en vez de "¿Sufres de X?", escribe "Atendemos X" o "Terapia para personas con X".',
  },
  {
    tipo: 'atributo-personal',
    // "tu ansiedad", "tu hijo con autismo", "su depresión"
    patron: new RegExp(`\\b(?:tu|tus|su|sus)\\s+(?:\\w+\\s+){0,2}(?:${CONDICIONES})\\b`, 'gi'),
    mensaje:
      'El posesivo da por hecho el diagnóstico de quien lo lee. Quita el "tu/su" y ' +
      'habla del servicio: "Terapia para X" en vez de "para tu X".',
  },
  {
    tipo: 'atributo-personal',
    // Preguntas dirigidas: "¿Te cuesta dormir?", "¿Tu hijo no habla?"
    patron: /¿\s*(?:te|tu|tus|usted|ustedes)\b[^?]{0,80}\?/gi,
    mensaje:
      'Es una pregunta dirigida a la persona sobre su situación. Meta la lee como ' +
      'atributo personal aunque no nombre el padecimiento. Conviértela en afirmación.',
  },
  {
    tipo: 'promesa-de-resultados',
    patron: /\b(?:garantiz\w+|100\s*%|cura(?:mos|r|ción)?|milagro\w*|resultados? asegurad\w+|sin dolor garantizado)\b/gi,
    mensaje:
      'Promete un resultado médico. Meta no permite garantizar curas ni resultados. ' +
      'Describe el proceso, no el desenlace.',
  },
  {
    tipo: 'antes-y-despues',
    patron: /\bantes y despu[eé]s\b/gi,
    mensaje:
      'Las comparaciones "antes y después" están prohibidas en anuncios de salud, ' +
      'tanto en el texto como en la imagen.',
  },
];

// Devuelve la lista de problemas encontrados en un copy. Vacía = se puede usar.
function revisarCopy(texto) {
  const hallazgos = [];
  if (!texto) return hallazgos;

  for (const regla of REGLAS) {
    // Reiniciamos el índice porque los patrones son globales y se reutilizan.
    regla.patron.lastIndex = 0;
    for (const coincidencia of String(texto).matchAll(regla.patron)) {
      hallazgos.push({
        tipo: regla.tipo,
        fragmento: coincidencia[0].trim(),
        mensaje: regla.mensaje,
      });
    }
  }

  return hallazgos;
}

module.exports = { revisarCopy, CONDICIONES };
