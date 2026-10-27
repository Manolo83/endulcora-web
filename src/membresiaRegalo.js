// Mes de membresia de regalo desde el boton "Descarga aqui el recetario"
// del live. Es una suscripcion normal de Mercado Pago ($100/mes, igual que
// /membresia) pero con el primer cobro programado a DIAS_REGALO dias: la
// clienta registra su tarjeta en el live, paga $0 ese dia y queda como
// miembro activa de inmediato. Si no cancela, al terminar el regalo se cobra
// sola cada mes, como cualquier otra membresia.
const store = require('./store');

const DIAS_REGALO = 30;
// Dias antes de que termine el regalo en los que se le avisa (en su cuenta
// de endulcora.com y por correo). Ordenados de mayor a menor.
const RECORDATORIOS_REGALO = [15, 3, 1];
const DIA_MS = 24 * 60 * 60 * 1000;

function fechaFinRegalo(desde = new Date()) {
  return new Date(desde.getTime() + DIAS_REGALO * DIA_MS);
}

function ultimos10Digitos(telefono) {
  return String(telefono || '').replace(/\D/g, '').slice(-10);
}

function yaTuvoMembresiaORegalo(u) {
  return !!(u.membresiaPrimeraActivacion || u.membresiaRegaloHasta || u.regaloRechazado);
}

// Solo quien nunca ha tenido membresia en toda su historia puede recibir el
// regalo (una sola vez por persona). Quien ya fue miembro ve la oferta
// normal de $100/mes. Para que no se pueda "renovar" el regalo cancelando y
// volviendo a pedirlo, se cierra en tres niveles:
//   1. Misma cuenta: si ya tuvo membresia o regalo alguna vez, nunca mas.
//   2. Cuenta nueva con el mismo telefono que otra que ya lo tuvo: no.
//   3. Cuenta nueva con todo distinto pero la misma cuenta de Mercado Pago:
//      se detecta al activarse (ver payerYaUsoRegalo) y se cancela sola.
function esElegibleRegalo(usuario) {
  if (!usuario) return false;
  if (usuario.membresiaEstado === 'activa') return false;
  if (yaTuvoMembresiaORegalo(usuario)) return false;
  const tel = ultimos10Digitos(usuario.telefono);
  if (tel.length === 10) {
    const mismoTelefono = store.getUsers().some(
      (u) => u.id !== usuario.id && ultimos10Digitos(u.telefono) === tel && yaTuvoMembresiaORegalo(u)
    );
    if (mismoTelefono) return false;
  }
  return true;
}

// Nivel 3: la cuenta de Mercado Pago (payer_id) ya activo un regalo con
// otra cuenta de endulcora.com.
function payerYaUsoRegalo(payerId, usuarioId) {
  if (!payerId) return false;
  return store.getUsers().some((u) => u.id !== usuarioId && u.regaloPayerId === String(payerId));
}

function regaloActivo(usuario, ahora = new Date()) {
  return !!(usuario && usuario.membresiaRegaloHasta && new Date(usuario.membresiaRegaloHasta) > ahora);
}

// Dias completos que le quedan (redondeado hacia arriba: con 14.2 dias
// restantes se le muestra "15", igual que un contador de cuenta regresiva).
function diasRestantesRegalo(usuario, ahora = new Date()) {
  if (!regaloActivo(usuario, ahora)) return 0;
  return Math.ceil((new Date(usuario.membresiaRegaloHasta) - ahora) / DIA_MS);
}

// Resumen para el sitio (/api/membresia/estado) y para /admin.
function resumenRegalo(usuario, ahora = new Date()) {
  if (!regaloActivo(usuario, ahora)) return null;
  const diasRestantes = diasRestantesRegalo(usuario, ahora);
  return {
    hasta: usuario.membresiaRegaloHasta,
    diasRestantes,
    diasTotales: DIAS_REGALO,
    cancelada: !!usuario.membresiaRegaloCancelada,
    // El aviso en su cuenta aparece a partir del primer recordatorio (15 dias).
    mostrarAviso: diasRestantes <= RECORDATORIOS_REGALO[0],
    recetarioDisponible: !!usuario.regaloRecetarioUrl,
  };
}

// Recordatorio que le toca ahora (el mas cercano que ya alcanzo y que
// todavia no se le manda), o null. Si el servidor estuvo apagado y se salto
// alguno, solo se manda el mas reciente — nunca dos correos seguidos.
function recordatorioPendiente(usuario, ahora = new Date()) {
  if (!regaloActivo(usuario, ahora)) return null;
  const dias = diasRestantesRegalo(usuario, ahora);
  const enviados = usuario.regaloRecordatoriosEnviados || [];
  const alcanzados = RECORDATORIOS_REGALO.filter((h) => dias <= h);
  if (!alcanzados.length) return null;
  const masCercano = alcanzados[alcanzados.length - 1];
  if (enviados.includes(masCercano)) return null;
  return { hito: masCercano, dias, marcarComoEnviados: alcanzados };
}

// Regalo que ya termino: si cancelo durante el regalo se le quita el acceso
// (mientras duraba lo conservo). Si no cancelo, la suscripcion de Mercado
// Pago sigue autorizada y el primer cobro mantiene su membresia activa.
function getRegalosVencidosCancelados(ahora = new Date()) {
  return store.getUsers().filter(
    (u) => u.membresiaRegaloHasta && u.membresiaRegaloCancelada && u.membresiaEstado === 'activa' && new Date(u.membresiaRegaloHasta) <= ahora
  );
}

module.exports = {
  DIAS_REGALO,
  RECORDATORIOS_REGALO,
  fechaFinRegalo,
  esElegibleRegalo,
  payerYaUsoRegalo,
  regaloActivo,
  diasRestantesRegalo,
  resumenRegalo,
  recordatorioPendiente,
  getRegalosVencidosCancelados,
};
