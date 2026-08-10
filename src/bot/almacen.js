// Almacenamiento del bot de Meta (WhatsApp, Messenger e Instagram).
//
// A diferencia del resto del sitio, esto NO vive en el JSON de app_data: ese
// documento se reescribe completo en cada save() y un chat escribe demasiado
// seguido. Aqui se usan tablas normales sobre el mismo Postgres.

const { pool } = require('../store');

// Cuantos mensajes de la conversacion se le pasan al modelo. Mas contexto es
// mas costo por mensaje y mas riesgo de que se le olvide la instruccion.
const MENSAJES_DE_CONTEXTO = 16;

// Una reserva sin anticipo pagado libera el lugar sola.
const HORAS_PARA_EXPIRAR_RESERVA = 24;

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

    CREATE TABLE IF NOT EXISTS bot_reservas (
      id SERIAL PRIMARY KEY,
      contacto_id INT NOT NULL REFERENCES bot_contactos(id) ON DELETE CASCADE,
      sesion_id INT NOT NULL,
      sede TEXT NOT NULL DEFAULT '',
      fecha DATE NOT NULL,
      titulo TEXT NOT NULL DEFAULT '',
      nombre TEXT NOT NULL DEFAULT '',
      personas INT NOT NULL DEFAULT 1,
      estado TEXT NOT NULL DEFAULT 'apartada',
      expira_at TIMESTAMPTZ,
      creado_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS bot_reservas_sesion_idx ON bot_reservas (sesion_id);

    CREATE TABLE IF NOT EXISTS bot_eventos (
      id TEXT PRIMARY KEY,
      creado_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  console.log('[bot] Tablas del bot listas.');
}

// Meta reenvia el mismo webhook cuando no recibe un 200 a tiempo. Sin esto,
// un reintento genera una segunda respuesta (y una segunda reserva).
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
     RETURNING *`,
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

async function guardarMensaje(contactoId, rol, texto) {
  await pool.query('INSERT INTO bot_mensajes (contacto_id, rol, texto) VALUES ($1, $2, $3)', [
    contactoId,
    rol,
    String(texto || '').slice(0, 4000),
  ]);
}

async function historial(contactoId) {
  const res = await pool.query(
    'SELECT rol, texto FROM bot_mensajes WHERE contacto_id = $1 ORDER BY id DESC LIMIT $2',
    [contactoId, MENSAJES_DE_CONTEXTO]
  );
  return res.rows.reverse();
}

// Cuenta los lugares que siguen vivos para una sesion del calendario: los
// apartados sin vencer y los ya confirmados.
async function lugaresTomados(sesionId) {
  const res = await pool.query(
    `SELECT COALESCE(SUM(personas), 0)::int AS total
     FROM bot_reservas
     WHERE sesion_id = $1
       AND (estado = 'confirmada' OR (estado = 'apartada' AND expira_at > now()))`,
    [sesionId]
  );
  return res.rows[0].total;
}

async function crearReserva({ contactoId, sesionId, sede, fecha, titulo, nombre, personas }) {
  const res = await pool.query(
    `INSERT INTO bot_reservas (contacto_id, sesion_id, sede, fecha, titulo, nombre, personas, expira_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now() + ($8 || ' hours')::interval)
     RETURNING *`,
    [contactoId, sesionId, sede, fecha, titulo, nombre, personas, String(HORAS_PARA_EXPIRAR_RESERVA)]
  );
  return res.rows[0];
}

async function reservasVivasDeContacto(contactoId) {
  const res = await pool.query(
    `SELECT * FROM bot_reservas
     WHERE contacto_id = $1
       AND (estado = 'confirmada' OR (estado = 'apartada' AND expira_at > now()))
     ORDER BY fecha`,
    [contactoId]
  );
  return res.rows;
}

// Marca como expiradas las que nadie pago a tiempo, para que su cupo se libere.
async function expirarReservasVencidas() {
  const res = await pool.query(
    "UPDATE bot_reservas SET estado = 'expirada' WHERE estado = 'apartada' AND expira_at <= now() RETURNING id"
  );
  return res.rowCount;
}

async function listarReservas() {
  const res = await pool.query(
    `SELECT r.*, c.canal, c.telefono, c.externo_id
     FROM bot_reservas r
     JOIN bot_contactos c ON c.id = r.contacto_id
     ORDER BY r.creado_at DESC
     LIMIT 300`
  );
  return res.rows;
}

async function cambiarEstadoReserva(id, estado) {
  const res = await pool.query('UPDATE bot_reservas SET estado = $2 WHERE id = $1 RETURNING *', [id, estado]);
  return res.rows[0] || null;
}

async function listarConversaciones() {
  const res = await pool.query(
    `SELECT c.*,
            (SELECT texto FROM bot_mensajes m WHERE m.contacto_id = c.id ORDER BY m.id DESC LIMIT 1) AS ultimo_texto,
            (SELECT count(*) FROM bot_mensajes m WHERE m.contacto_id = c.id)::int AS total_mensajes
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

module.exports = {
  init,
  esEventoNuevo,
  limpiarEventosViejos,
  obtenerOCrearContacto,
  actualizarContacto,
  guardarMensaje,
  historial,
  lugaresTomados,
  crearReserva,
  reservasVivasDeContacto,
  expirarReservasVencidas,
  listarReservas,
  cambiarEstadoReserva,
  listarConversaciones,
  mensajesDeContacto,
  HORAS_PARA_EXPIRAR_RESERVA,
};
