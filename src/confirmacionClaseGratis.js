// Envio masivo del correo de acceso anticipado de la master class (antes
// "¿Asistirás?" con ficha gratis; ahora la ficha presencial se compra, ver
// src/accesoAnticipado.js). Cada correo lleva el link personal del
// registro: solo quien se registro puede comprar su acceso.
// Mismo patron de resumibilidad
// que src/campanas.js: guarda de inmediato quien ya quedo procesado, para
// que si el servidor se reinicia a la mitad (ej. un deploy) se retome solo
// donde se quedo en vez de perder el resto o repetir correos.
const store = require('./store');
const { SITE_URL } = require('./config');
const { enviarCorreoAccesoAnticipado } = require('./email');
const acceso = require('./accesoAnticipado');

let procesando = false;

function cierreLegible(contenido) {
  const cierre = acceso.fechaCierre(contenido);
  if (!cierre) return '';
  return cierre.toLocaleString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', timeZone: 'America/Mexico_City' });
}

// Tambien se usa al registrarse cuando el acceso anticipado ya esta abierto
// (quien llega despues del envio masivo no se queda sin su link).
function mandarCorreoAcceso(registro, contenido = store.getContent()) {
  return enviarCorreoAccesoAnticipado({
    to: registro.correo,
    nombre: registro.nombre,
    titulo: contenido.clasegratis_titulo,
    fecha: registro.fecha,
    horario: registro.horario,
    ubicacion: contenido.clasegratis_ubicacion,
    link: acceso.linkAcceso(SITE_URL, registro),
    precio: acceso.precioAcceso(contenido),
    cupo: store.cupoClaseGratisPorHorario(),
    cierreLegible: cierreLegible(contenido),
  });
}

async function procesarEnvioConfirmacionClaseGratis() {
  if (procesando) return;
  procesando = true;
  try {
    const envio = store.getEnvioConfirmacionClaseGratis();
    if (!envio || envio.estado === 'terminada') return;

    const contenido = store.getContent();
    const yaProcesados = new Set([...(envio.enviadosIds || []), ...(envio.fallidosIds || [])]);
    const pendientes = (envio.registroIds || []).filter((id) => !yaProcesados.has(id));
    const registros = store.getRegistrosClaseGratis();
    const mapaRegistros = new Map(registros.map((r) => [r.id, r]));

    for (const id of pendientes) {
      const registro = mapaRegistros.get(id);
      if (!registro) {
        store.registrarResultadoEnvioConfirmacionClaseGratis(id, false, 'Registro ya no existe');
        continue;
      }
      let exito = false;
      let errorMsg = '';
      try {
        await mandarCorreoAcceso(registro, contenido);
        exito = true;
      } catch (e) {
        errorMsg = e.message || String(e);
        console.error(`[clase-gratis] Fallo al mandar confirmacion a ${registro.correo}:`, errorMsg);
      }
      store.registrarResultadoEnvioConfirmacionClaseGratis(id, exito, errorMsg);
      // Pausa entre envios para respetar el ritmo de la API de Resend.
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  } finally {
    procesando = false;
  }
}

// Al arrancar el servidor (deploy, reinicio a medio envio) retoma un envio
// sin terminar, con el mismo margen de espera que las campañas de correo
// para que el dueño del sitio pueda cancelar desde /admin si el reinicio
// fue justo por eso.
const ESPERA_INICIAL_MS = 3 * 60 * 1000;
function reanudarEnvioConfirmacionPendiente() {
  setTimeout(() => {
    const envio = store.getEnvioConfirmacionClaseGratis();
    if (envio && envio.estado !== 'terminada') procesarEnvioConfirmacionClaseGratis().catch(() => {});
  }, ESPERA_INICIAL_MS);
}

// Los recordatorios de antes (2 dias y el mismo dia, solo a quien pago)
// los reemplazan los correos del plan de ventas: src/correosMasterclass.js.
function iniciarAutomatizacionClaseGratis() {
  reanudarEnvioConfirmacionPendiente();
}

module.exports = { procesarEnvioConfirmacionClaseGratis, iniciarAutomatizacionClaseGratis, mandarCorreoAcceso };
