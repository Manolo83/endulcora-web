// Almacenamiento del bot de Meta (WhatsApp, Messenger e Instagram).
//
// A diferencia del resto del sitio, esto NO vive en el JSON de app_data: ese
// documento se reescribe completo en cada save() y un chat escribe demasiado
// seguido. Aqui se usan tablas normales sobre el mismo Postgres.

const { pool } = require('../store');

// Cuantos mensajes de la conversacion se le pasan al modelo. Mas contexto es
// mas costo por mensaje y mas riesgo de que se le olvide la instruccion.
const MENSAJES_DE_CONTEXTO = 16;

// Etapas del embudo. El bot llega hasta 'instrucciones_enviadas' y ahi entrega
// la conversacion: no cobra, no valida comprobantes, no inscribe.
const ETAPAS = [
  'nuevo',
  'copy_enviado',
  'promo_enviada',
  'personas_confirmadas',
  'instrucciones_enviadas',
];

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bot_contactos (
      id SERIAL PRIMARY KEY,
      canal TEXT NOT NULL,
      externo_id TEXT NOT NULL,
      nombre TEXT NOT NULL DEFAULT '',
      telefono TEXT NOT NULL DEFAULT '',
      estado TEXT NOT NULL DEFAULT 'bot',
      motivo_escalado TEXT NOT NULL DEFAULT '',
      creado_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      ultimo_mensaje_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (canal, externo_id)
    );

    CREATE TABLE IF NOT EXISTS bot_mensajes (
      id BIGSERIAL PRIMARY KEY,
      contacto_id INT NOT NULL REFERENCES bot_contactos(id) ON DELETE CASCADE,
      rol TEXT NOT NULL,
      texto TEXT NOT NULL,
      creado_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS bot_mensajes_contacto_idx ON bot_mensajes (contacto_id, id DESC);

    CREATE TABLE IF NOT EXISTS bot_solicitudes (
      id SERIAL PRIMARY KEY,
      contacto_id INT NOT NULL REFERENCES bot_contactos(id) ON DELETE CASCADE,
      taller_bot_id INT,
      taller TEXT NOT NULL DEFAULT '',
      sesion_id INT,
      fecha_texto TEXT NOT NULL DEFAULT '',
      personas INT NOT NULL DEFAULT 1,
      anticipo INT NOT NULL DEFAULT 0,
      total INT NOT NULL DEFAULT 0,
      saldo INT NOT NULL DEFAULT 0,
      etapa TEXT NOT NULL DEFAULT 'nuevo',
      limite_pago TIMESTAMPTZ,
      creado_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      actualizado_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS bot_solicitudes_contacto_idx ON bot_solicitudes (contacto_id, id DESC);

    CREATE TABLE IF NOT EXISTS bot_eventos (
      id TEXT PRIMARY KEY,
      creado_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  console.log('[bot] Tablas del bot listas.');
}

// Meta reenvia el mismo webhook cuando no recibe un 200 a tiempo. Sin esto, un
// reintento genera una segunda respuesta (y un segundo copy enviado).
// Devuelve true solo la primera vez que se ve ese id de mensaje.
async function esEventoNuevo(idMensaje) {
  if (!idMensaje) return true;
  const res = await pool.query(
    'INSERT INTO bot_eventos (id) VALUES ($1) ON CONFLICT (id) DO NOTHING RETURNING id',
    [String(idMensaje)]
  );
  return res.rowCount > 0;
}

async function limpiarEventosViejos() {
  await pool.query("DELETE FROM bot_eventos WHERE creado_at < now() - INTERVAL '3 days'");
}

async function obtenerOCrearContacto({ canal, externoId, nombre, telefono }) {
  const res = await pool.query(
    `INSERT INTO bot_contactos (canal, externo_id, nombre, telefono)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (canal, externo_id) DO UPDATE
       SET ultimo_mensaje_at = now(),
           nombre = CASE WHEN bot_contactos.nombre = '' THEN EXCLUDED.nombre ELSE bot_contactos.nombre END,
           telefono = CASE WHEN bot_contactos.telefono = '' THEN EXCLUDED.telefono ELSE bot_contactos.telefono END
     RETURNING *, (xmax = 0) AS es_nuevo`,
    [canal, String(externoId), nombre || '', telefono || '']
  );
  return res.rows[0];
}

async function actualizarContacto(id, { estado, motivoEscalado, nombre }) {
  const res = await pool.query(
    `UPDATE bot_contactos
     SET estado = COALESCE($2, estado),
         motivo_escalado = COALESCE($3, motivo_escalado),
         nombre = COALESCE($4, nombre)
     WHERE id = $1
     RETURNING *`,
    [id, estado || null, motivoEscalado || null, nombre || null]
  );
  return res.rows[0] || null;
}

// Cuenta cuantos mensajes ha mandado el bot a este contacto. Sirve para saber
// si ya se presento (y no repetir la bienvenida en cada mensaje).
async function yaSaludo(contactoId) {
  const res = await pool.query(
    "SELECT 1 FROM bot_mensajes WHERE contacto_id = $1 AND rol = 'bot' LIMIT 1",
    [contactoId]
  );
  return res.rowCount > 0;
}

async function guardarMensaje(contactoId, rol, texto) {
  const limpio = String(texto || '').slice(0, 4000);
  if (!limpio.trim()) return;
  await pool.query('INSERT INTO bot_mensajes (contacto_id, rol, texto) VALUES ($1, $2, $3)', [
    contactoId,
    rol,
    limpio,
  ]);
}

async function historial(contactoId, limite = MENSAJES_DE_CONTEXTO) {
  const res = await pool.query(
    'SELECT rol, texto, creado_at FROM bot_mensajes WHERE contacto_id = $1 ORDER BY id DESC LIMIT $2',
    [contactoId, limite]
  );
  return res.rows.reverse();
}

/* ---- Solicitudes (intencion de apartar; el apartado real lo confirmas tu) ---- */

async function solicitudAbierta(contactoId) {
  const res = await pool.query(
    `SELECT * FROM bot_solicitudes
     WHERE contacto_id = $1 AND etapa <> 'cancelada'
     ORDER BY id DESC LIMIT 1`,
    [contactoId]
  );
  return res.rows[0] || null;
}

async function crearSolicitud({ contactoId, tallerBotId, taller }) {
  const res = await pool.query(
    `INSERT INTO bot_solicitudes (contacto_id, taller_bot_id, taller, etapa)
     VALUES ($1, $2, $3, 'copy_enviado')
     RETURNING *`,
    [contactoId, tallerBotId, taller]
  );
  return res.rows[0];
}

async function actualizarSolicitud(id, patch) {
  const campos = [];
  const valores = [id];
  const mapa = {
    etapa: 'etapa',
    personas: 'personas',
    anticipo: 'anticipo',
    total: 'total',
    saldo: 'saldo',
    fechaTexto: 'fecha_texto',
    sesionId: 'sesion_id',
    limitePago: 'limite_pago',
  };
  for (const [clave, columna] of Object.entries(mapa)) {
    if (patch[clave] !== undefined) {
      valores.push(patch[clave]);
      campos.push(`${columna} = $${valores.length}`);
    }
  }
  if (!campos.length) return null;
  const res = await pool.query(
    `UPDATE bot_solicitudes SET ${campos.join(', ')}, actualizado_at = now() WHERE id = $1 RETURNING *`,
    valores
  );
  return res.rows[0] || null;
}

async function listarSolicitudes() {
  const res = await pool.query(
    `SELECT s.*, c.canal, c.telefono, c.externo_id, c.nombre AS contacto_nombre, c.estado AS contacto_estado
     FROM bot_solicitudes s
     JOIN bot_contactos c ON c.id = s.contacto_id
     ORDER BY s.actualizado_at DESC
     LIMIT 300`
  );
  return res.rows;
}

/* ---- Lecturas para el panel ---- */

async function listarConversaciones() {
  const res = await pool.query(
    `SELECT c.*,
            (SELECT texto FROM bot_mensajes m WHERE m.contacto_id = c.id ORDER BY m.id DESC LIMIT 1) AS ultimo_texto,
            (SELECT count(*) FROM bot_mensajes m WHERE m.contacto_id = c.id)::int AS total_mensajes,
            (SELECT etapa FROM bot_solicitudes s WHERE s.contacto_id = c.id ORDER BY s.id DESC LIMIT 1) AS etapa
     FROM bot_contactos c
     ORDER BY c.ultimo_mensaje_at DESC
     LIMIT 200`
  );
  return res.rows;
}

async function mensajesDeContacto(contactoId) {
  const res = await pool.query(
    'SELECT rol, texto, creado_at FROM bot_mensajes WHERE contacto_id = $1 ORDER BY id LIMIT 400',
    [contactoId]
  );
  return res.rows;
}

// WhatsApp solo entrega texto libre dentro de las 24 h siguientes al ultimo
// mensaje del cliente; despues exige una plantilla aprobada. El panel lo
// consulta para avisarte antes de que escribas, en vez de fallar al enviar.
async function ultimoMensajeCliente(contactoId) {
  const res = await pool.query(
    "SELECT creado_at FROM bot_mensajes WHERE contacto_id = $1 AND rol = 'cliente' ORDER BY id DESC LIMIT 1",
    [contactoId]
  );
  return res.rows[0] ? res.rows[0].creado_at : null;
}

async function contactoPorId(id) {
  const res = await pool.query('SELECT * FROM bot_contactos WHERE id = $1', [id]);
  return res.rows[0] || null;
}

module.exports = {
  init,
  ETAPAS,
  esEventoNuevo,
  limpiarEventosViejos,
  obtenerOCrearContacto,
  actualizarContacto,
  contactoPorId,
  yaSaludo,
  guardarMensaje,
  ultimoMensajeCliente,
  historial,
  solicitudAbierta,
  crearSolicitud,
  actualizarSolicitud,
  listarSolicitudes,
  listarConversaciones,
  mensajesDeContacto,
};
