const express = require('express');
const { GoogleGenAI } = require('@google/genai');
const store = require('../store');

const router = express.Router();

const MODELO = 'gemini-3.6-flash';
const NUMERO_WHATSAPP = '+52 56 6527 1901';

let cliente = null;
function obtenerCliente() {
  if (!process.env.GEMINI_API_KEY) return null;
  if (!cliente) cliente = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return cliente;
}

const ESTADOS_TALLER = { disponible: 'Disponible', casi_lleno: 'Casi lleno', agotado: 'Agotado' };

function construirCalendario() {
  const hoyISO = new Date().toISOString().slice(0, 10);
  const sedes = store.getSedes();
  const bloques = sedes
    .map((sede) => {
      const sesiones = store.getSesionesTaller(sede.id);
      if (!sesiones.length) return null;
      const lineas = sesiones
        .map((s) => {
          const estado = s.fecha < hoyISO ? 'Ya pasó, no disponible' : ESTADOS_TALLER[s.estado] || 'Disponible';
          return `  - ${s.fecha}: ${s.titulo} (${estado})`;
        })
        .join('\n');
      return `Sede ${sede.nombre}:\n${lineas}`;
    })
    .filter(Boolean)
    .join('\n\n');
  return { hoyISO, bloques };
}

function construirInstrucciones() {
  const productos = store
    .getProducts()
    .map((p) => `- ${p.titulo}${p.subtitulo ? ' (' + p.subtitulo + ')' : ''} [${p.categoria}]: $${p.precio} MXN. ${p.descripcionCorta || ''}`)
    .join('\n');
  const cursos = store
    .getCursos()
    .map((c) => `- ${c.titulo} [${c.modalidad}]: $${c.precio} MXN. ${c.descripcion || ''}`)
    .join('\n');
  const { hoyISO, bloques } = construirCalendario();

  return `Eres el asistente virtual del sitio web de Endulcora, un estudio gastronómico en Ciudad de México especializado en repostería con costeo real (eBooks, hojas de costeo, apps de bolsillo y cursos/talleres).

Tu única función es:
1. Recomendar productos y cursos del catálogo de abajo según lo que pida el visitante.
2. Responder dudas sobre el sitio: cómo comprar, cómo se entrega (descarga por correo al confirmarse el pago), precios, políticas.
3. Decir qué talleres presenciales hay programados en el calendario, en qué sede y fecha, y si todavía hay lugar.
4. Ayudar a entender la calculadora de costeo de la página y conceptos básicos de costeo de repostería (insumos, merma, margen, precio de venta).

CATÁLOGO DE PRODUCTOS:
${productos || '(sin productos cargados por ahora)'}

CURSOS EN LÍNEA (venta directa, no requieren fecha):
${cursos || '(sin cursos cargados por ahora)'}

CALENDARIO DE TALLERES PRESENCIALES PROGRAMADOS (hoy es ${hoyISO}):
${bloques || '(sin talleres programados por ahora)'}

REGLAS ESTRICTAS:
- Usa solo los productos, cursos, talleres, precios y fechas de las listas de arriba. Nunca inventes nada que no esté aquí.
- Si preguntan por un taller que SÍ aparece en el calendario, confírmales la fecha, la sede y si está "Disponible", "Casi lleno" o "Agotado". Para apartar su lugar, diles que hagan clic en ese día dentro de la sección "Calendario" de la página (los manda directo a WhatsApp) o que escriban directamente por WhatsApp.
- Si preguntan por un taller que NO aparece en el calendario, dilo con claridad — no digas que "tal vez" existe — y sugiere escribir por WhatsApp al ${NUMERO_WHATSAPP} para preguntar si se puede organizar.
- Si preguntan algo fuera de estos temas, o piden algo que Endulcora no ofrece, dilo con amabilidad y sugiere escribir por WhatsApp al ${NUMERO_WHATSAPP}.
- No puedes agendar talleres, procesar pagos ni acceder a cuentas de clientes.
- No des consejos médicos, de alergias ni de seguridad alimentaria con certeza absoluta; sugiere confirmar directamente con Endulcora.
- Responde siempre en español, de forma breve (2 a 4 oraciones normalmente), cálida y cercana al tono de la marca: alegre y profesional, sin tecnicismos innecesarios.`;
}

router.post('/chat', async (req, res) => {
  const ai = obtenerCliente();
  if (!ai) {
    return res.status(503).json({ error: 'El asistente todavía no está activado.' });
  }

  const historial = Array.isArray(req.body && req.body.historial) ? req.body.historial : [];
  const contents = historial
    .filter((m) => m && typeof m.text === 'string' && m.text.trim() && (m.role === 'user' || m.role === 'model'))
    .slice(-16)
    .map((m) => ({ role: m.role, parts: [{ text: m.text.trim() }] }));

  if (!contents.length || contents[contents.length - 1].role !== 'user') {
    return res.status(400).json({ error: 'Escribe un mensaje.' });
  }

  try {
    const respuesta = await ai.models.generateContent({
      model: MODELO,
      contents,
      config: { systemInstruction: construirInstrucciones() },
    });
    const texto = (respuesta.text || '').trim() || 'No tengo una respuesta para eso, pero puedes escribirnos por WhatsApp.';
    res.json({ respuesta: texto });
  } catch (e) {
    console.error('Error del asistente (Gemini):', e.message);
    res.status(502).json({ error: 'No se pudo generar una respuesta. Intenta de nuevo en un momento.' });
  }
});

module.exports = router;
