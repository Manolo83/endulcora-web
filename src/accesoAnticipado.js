// Acceso anticipado de la master class presencial. Reemplaza a la ficha
// gratis del "modo carrera": solo quien se registro (formulario de
// /clase-gratis) puede comprarlo, desde su link personal del correo.
//
// - Mientras haya fichas en su horario: ficha de asistencia numerada,
//   coffee break, recetario y 1 mes de membresia.
// - Cuando el horario llega al tope (50 por defecto): por el mismo precio,
//   recetario y 1 mes de membresia (ve la clase en linea).
//
// El pago es unico (no domiciliado): el mes de membresia termina solo a los
// 30 dias y renovarla es responsabilidad de la asistente (los recordatorios
// de 15, 3 y 1 dias la invitan a domiciliar, ver src/membresiaRegalo.js).
const store = require('./store');
const regalo = require('./membresiaRegalo');

// Mientras alguien paga con tarjeta se le aparta su ficha este tiempo, para
// que nadie se la gane a medio pago. Si no termina, se libera sola.
const MINUTOS_APARTADO = 30;
// CDMX no tiene horario de verano desde 2022.
const OFFSET_CDMX = '-06:00';

function precioAcceso(contenido = store.getContent()) {
  const n = parseFloat(String(contenido.clasegratis_acceso_precio || '').replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : 100;
}

function hoyCDMX(ahora = new Date()) {
  return new Date(ahora.getTime() - 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function fechaCierre(contenido) {
  const cierre = String(contenido.clasegratis_acceso_cierre || '').trim();
  if (!cierre) return null;
  const fecha = new Date(`${cierre.length === 16 ? `${cierre}:00` : cierre}${OFFSET_CDMX}`);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

// Registro de la master class abierto: "Clase gratis activa" en /admin Y una
// fecha que todavia no pasa. Sin fecha, o con la fecha de una clase que ya
// paso (p. ej. pan de muerto), todo queda oculto aunque se haya olvidado
// apagarlo: nadie se puede registrar a algo que no esta programado.
function registroAbierto(contenido = store.getContent(), ahora = new Date()) {
  if (contenido.clasegratis_activo !== 'true') return false;
  if (!contenido.clasegratis_fecha) return false;
  return contenido.clasegratis_fecha >= hoyCDMX(ahora);
}

// El acceso anticipado se abre en cuanto el registro de la clase esta
// abierto (misma condicion que registroAbierto), y se cierra en la fecha de
// cierre configurada (si hay) o al pasar el dia de la clase. Asi el primer
// registro de la master class ya recibe su link de acceso anticipado en el
// correo de confirmacion instantaneo, sin que el admin tenga que mandar
// antes el correo masivo (ese boton sigue sirviendo para reenviarlo a quien
// se registro antes de que esto se configurara bien).
function accesoAbierto(contenido = store.getContent(), ahora = new Date()) {
  if (!registroAbierto(contenido, ahora)) return false;
  const cierre = fechaCierre(contenido);
  if (cierre && ahora >= cierre) return false;
  return true;
}

function apartadoVigente(r, ahora = new Date()) {
  return r.accesoEstado === 'apartado' && r.accesoTipo === 'presencial' && r.accesoApartadoHasta && new Date(r.accesoApartadoHasta) > ahora;
}

// Fichas ocupadas del horario: las ya asignadas mas las apartadas mientras
// alguien paga.
function estadoHorario(fecha, horario, { excluirId = null, ahora = new Date() } = {}) {
  const cupo = store.cupoClaseGratisPorHorario();
  const ocupadas = store
    .getRegistrosClaseGratis()
    .filter((r) => r.fecha === fecha && r.horario === horario && r.id !== excluirId)
    .filter((r) => (r.confirmado && r.numeroInscrito) || apartadoVigente(r, ahora)).length;
  return { cupo, ocupadas, quedan: Math.max(0, cupo - ocupadas) };
}

// Antes de mandar a Mercado Pago: decide si lo que compra es la ficha
// presencial (y se la aparta) o el acceso en linea. Todo es sincrono, asi
// que dos personas no pueden apartar la misma ultima ficha a la vez.
function prepararPago(registroId, ahora = new Date()) {
  const registro = store.getRegistroClaseGratis(registroId);
  if (!registro) return null;
  if (apartadoVigente(registro, ahora)) {
    return { tipo: 'presencial', apartadoHasta: registro.accesoApartadoHasta };
  }
  const { quedan } = estadoHorario(registro.fecha, registro.horario, { excluirId: registro.id, ahora });
  if (quedan > 0) {
    const apartadoHasta = new Date(ahora.getTime() + MINUTOS_APARTADO * 60 * 1000).toISOString();
    store.updateRegistroClaseGratis(registro.id, { accesoEstado: 'apartado', accesoTipo: 'presencial', accesoApartadoHasta: apartadoHasta });
    return { tipo: 'presencial', apartadoHasta };
  }
  store.updateRegistroClaseGratis(registro.id, { accesoEstado: '', accesoTipo: 'online', accesoApartadoHasta: null });
  return { tipo: 'online', apartadoHasta: null };
}

function siguienteNumeroFicha(fecha, horario) {
  const numeros = store
    .getRegistrosClaseGratis()
    .filter((r) => r.fecha === fecha && r.horario === horario && r.confirmado && r.numeroInscrito)
    .map((r) => r.numeroInscrito);
  return numeros.length ? Math.max(...numeros) + 1 : 1;
}

// Pago aprobado (webhook de Mercado Pago). Idempotente: si Mercado Pago
// avisa dos veces, la segunda no hace nada. Regresa el registro actualizado
// y si este aviso fue el que lo aplico (para mandar el correo una sola vez).
function aplicarPagoAprobado(registroId, { monto, userId, ahora = new Date() } = {}) {
  const registro = store.getRegistroClaseGratis(registroId);
  if (!registro) return { registro: null, aplicado: false };
  if (registro.accesoEstado === 'pagado') return { registro, aplicado: false };

  const contenido = store.getContent();
  const quiereFicha = registro.accesoTipo === 'presencial';
  // Si su apartado ya habia vencido y en ese rato se llenaron las fichas,
  // recibe el acceso en linea (mismo precio) y se le avisa en el correo.
  const hayFicha = quiereFicha && estadoHorario(registro.fecha, registro.horario, { excluirId: registro.id, ahora }).quedan > 0;
  const patch = {
    accesoEstado: 'pagado',
    accesoTipo: hayFicha ? 'presencial' : 'online',
    accesoPasoAOnline: quiereFicha && !hayFicha,
    accesoApartadoHasta: null,
    accesoPagadoEn: ahora.toISOString(),
    accesoMonto: Number(monto) || precioAcceso(contenido),
    accesoRecetarioUrl: contenido.clasegratis_recetario_url || '',
    accesoRecetarioNombre: contenido.clasegratis_recetario_nombre || '',
  };
  if (hayFicha) {
    patch.confirmado = true;
    patch.asistencia = 'si';
    patch.numeroInscrito = siguienteNumeroFicha(registro.fecha, registro.horario);
    patch.confirmadoEn = ahora.toISOString();
  }
  const actualizado = store.updateRegistroClaseGratis(registro.id, patch);

  // Mes de membresia: a quien ya es miembro activo no se le agrega nada (ya
  // la tiene). A los demas, 30 dias que terminan solos.
  const usuario = (userId && store.getUserById(userId)) || store.getUserByEmail(registro.correo);
  let membresiaHasta = null;
  let yaEraMiembro = false;
  if (usuario) {
    if (usuario.membresiaEstado === 'activa') {
      yaEraMiembro = true;
    } else {
      const conMes = regalo.activarMesPagado(usuario, {
        origen: 'acceso_anticipado',
        recetarioUrl: patch.accesoRecetarioUrl,
        recetarioNombre: patch.accesoRecetarioNombre,
        ahora,
      });
      membresiaHasta = conMes.membresiaRegaloHasta;
    }
  }
  return { registro: actualizado, aplicado: true, membresiaHasta, yaEraMiembro };
}

// Pago rechazado o cancelado: libera la ficha apartada de ese intento.
function liberarApartado(registroId, orderId) {
  const registro = store.getRegistroClaseGratis(registroId);
  if (!registro || registro.accesoEstado !== 'apartado') return;
  if (registro.accesoOrderId && orderId && String(registro.accesoOrderId) !== String(orderId)) return;
  store.updateRegistroClaseGratis(registro.id, { accesoEstado: '', accesoApartadoHasta: null });
}

function linkAcceso(siteUrl, registro) {
  return `${siteUrl}/acceso-anticipado?id=${registro.id}&token=${registro.confirmToken}`;
}

module.exports = {
  MINUTOS_APARTADO,
  precioAcceso,
  fechaCierre,
  registroAbierto,
  accesoAbierto,
  estadoHorario,
  prepararPago,
  aplicarPagoAprobado,
  liberarApartado,
  linkAcceso,
};
