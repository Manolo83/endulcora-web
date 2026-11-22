// Quita el acceso a la membresia a quien tiene la suscripcion "autorizada"
// en Mercado Pago pero ya no le entra el cobro mensual (tarjeta rechazada,
// sin fondos, reintentos). Mercado Pago no siempre cancela la suscripcion en
// esos casos, y sin esto la persona seguia entrando sin pagar.
//
// Regla (Manuel, 21 nov 2026): si 5 dias despues de la fecha en que le
// tocaba pagar no hay un cobro aprobado, pierde el acceso. Si despues entra
// el cobro, se le regresa solo (ver guardarPagoDesdeInfo en
// routes/membresia.js). No aplica durante el mes de regalo ni a las altas
// manuales, que ya vencen solas.
const store = require('./store');
const regalo = require('./membresiaRegalo');
const email = require('./email');
const { SITE_URL } = require('./config');

const DIAS_PERIODO = 30;
const DIAS_GRACIA = 5;
const DIA_MS = 24 * 60 * 60 * 1000;

function ultimoCobroAprobado(usuario, pagos) {
  const fechas = pagos
    .filter((p) => p.estado === 'aprobado' && (p.userId === usuario.id || (p.email && p.email === usuario.email)))
    .map((p) => new Date(p.fecha).getTime())
    .filter((t) => !Number.isNaN(t));
  return fechas.length ? Math.max(...fechas) : null;
}

// Fecha en que le tocaba pagar: 30 dias despues del ultimo cobro aprobado.
// Si nunca ha pagado, el cobro tocaba al activar (o al terminar su mes de
// regalo): sin esto, quien domiciliaba con una tarjeta que rechaza el primer
// cobro tenia 35 dias gratis.
function fechaDePago(usuario, pagos) {
  const ultimo = ultimoCobroAprobado(usuario, pagos);
  const candidatos = [];
  if (ultimo) candidatos.push(ultimo + DIAS_PERIODO * DIA_MS);
  else {
    if (usuario.membresiaActivaDesde) candidatos.push(new Date(usuario.membresiaActivaDesde).getTime());
    if (usuario.membresiaPrimeraActivacion) candidatos.push(new Date(usuario.membresiaPrimeraActivacion).getTime());
  }
  if (usuario.membresiaRegaloHasta) candidatos.push(new Date(usuario.membresiaRegaloHasta).getTime());
  const validos = candidatos.filter((t) => t && !Number.isNaN(t));
  return validos.length ? Math.max(...validos) : null;
}

function estaMoroso(usuario, pagos, ahora = new Date()) {
  if (!usuario || usuario.membresiaEstado !== 'activa') return false;
  if (!usuario.membresiaPreapprovalId) return false; // alta manual: vence sola
  if (regalo.regaloActivo(usuario, ahora)) return false;
  const toca = fechaDePago(usuario, pagos);
  if (!toca) return false;
  return ahora.getTime() > toca + DIAS_GRACIA * DIA_MS;
}

async function revisarMorosos(ahora = new Date()) {
  const { sincronizarPagosDePreapproval, cancelarPreapprovalEnMercadoPago, PRECIO_REINGRESO } = require('./routes/membresia');
  let pagos = store.getMembresiaPagos();
  const candidatos = store.getUsers().filter((u) => estaMoroso(u, pagos, ahora));
  let suspendidos = 0;
  for (const usuario of candidatos) {
    // Antes de cortar, se trae de Mercado Pago cualquier cobro que no haya
    // llegado por webhook, para no quitarle el acceso a quien si pago.
    try { await sincronizarPagosDePreapproval(usuario.membresiaPreapprovalId, usuario); } catch (e) { /* se decide con lo que hay */ }
    pagos = store.getMembresiaPagos();
    const actual = store.getUserById(usuario.id);
    if (!estaMoroso(actual, pagos, ahora)) continue;
    store.updateUser(actual.id, { membresiaEstado: 'suspendida', membresiaMorosa: true, membresiaSuspendidaEn: ahora.toISOString() });
    suspendidos += 1;
    // Se cancela la suscripcion vieja de $100: para volver se domicilia de
    // nuevo, ya al precio de reingreso.
    try { cancelarPreapprovalEnMercadoPago(actual.membresiaPreapprovalId); } catch (e) { /* no detiene la suspension */ }
    if (!actual.correoSuspensionEnviado) {
      try {
        await email.enviarCorreoMembresiaSuspendida({
          to: actual.email,
          nombre: actual.nombre,
          siteUrl: SITE_URL,
          precio: PRECIO_REINGRESO,
          numeroWhatsapp: store.getContent().whatsapp_numero,
        });
        store.updateUser(actual.id, { correoSuspensionEnviado: true });
      } catch (e) {
        console.error('No se pudo mandar el aviso de suspensión a', actual.email, e.message);
      }
    }
    console.warn(`[membresia] Acceso suspendido por falta de pago: ${actual.email}`);
  }
  return suspendidos;
}

module.exports = { revisarMorosos, estaMoroso, DIAS_GRACIA };
