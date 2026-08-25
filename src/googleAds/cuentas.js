// Alta y consulta de las cuentas de Google Ads de cada negocio.
//
// Las cuatro cuentas son independientes (cada una con su presupuesto y su
// facturacion) pero se crean COMO HIJAS de la cuenta administradora (MCC), que
// es lo que permite administrarlas todas desde aqui con un solo permiso.

const { llamar, buscar } = require('./api');
const { GOOGLE_ADS } = require('../config');
const negocios = require('./negocios');

// Cuentas a las que llega el usuario que autorizo el acceso (normalmente: el
// MCC y, si acaso, cuentas sueltas que ya tenia).
async function listarAccesibles() {
  const data = await llamar('customers:listAccessibleCustomers', { method: 'GET' });
  return (data.resourceNames || []).map((r) => r.replace('customers/', ''));
}

// Cuentas que cuelgan del MCC, con nombre, moneda, zona y si estan suspendidas.
async function listarClientesDelMCC() {
  if (!GOOGLE_ADS.managerId) throw new Error('Falta GOOGLE_ADS_MANAGER_ID (el ID de la cuenta administradora).');

  const filas = await buscar(
    GOOGLE_ADS.managerId,
    `SELECT
       customer_client.id,
       customer_client.descriptive_name,
       customer_client.currency_code,
       customer_client.time_zone,
       customer_client.manager,
       customer_client.test_account,
       customer_client.status,
       customer_client.level
     FROM customer_client
     WHERE customer_client.status != 'CANCELED'`
  );

  return filas.map((f) => {
    const c = f.customerClient || {};
    return {
      id: String(c.id || ''),
      nombre: c.descriptiveName || '',
      moneda: c.currencyCode || '',
      zona: c.timeZone || '',
      esAdministradora: Boolean(c.manager),
      esPrueba: Boolean(c.testAccount),
      estado: c.status || '',
      nivel: Number(c.level || 0),
    };
  });
}

// Crea la cuenta de Google Ads de un negocio, colgada del MCC.
//
// Ojo: Google no permite crear cuentas hijas con un token de desarrollador de
// "acceso de prueba"; hace falta al menos acceso basico (ver docs/google-ads.md).
async function crearCuenta(clave, { moneda, zona, nombre } = {}) {
  const negocio = negocios.obtener(clave);
  if (!GOOGLE_ADS.managerId) throw new Error('Falta GOOGLE_ADS_MANAGER_ID (el ID de la cuenta administradora).');

  const cliente = {
    descriptiveName: nombre || negocio.descripcion,
    currencyCode: moneda || negocio.moneda,
    timeZone: zona || negocio.zona,
  };

  const data = await llamar(`customers/${GOOGLE_ADS.managerId}:createCustomerClient`, {
    body: { customerClient: cliente },
  });

  const resourceName = data.resourceName || (data.result && data.result.resourceName) || '';
  const id = resourceName.replace('customers/', '');
  return {
    negocio: negocio.clave,
    nombre: cliente.descriptiveName,
    id,
    resourceName,
    // Para dejarlo guardado en Railway y que el servidor sepa cual es.
    variableDeEntorno: `${negocio.envCuenta}=${id}`,
  };
}

// Foto completa: que negocios ya tienen cuenta configurada y cuales no, y que
// cuentas ve el MCC aunque todavia no esten enlazadas a un negocio.
async function estado() {
  const registro = negocios.listar();
  let clientes = [];
  let error = '';
  try {
    clientes = await listarClientesDelMCC();
  } catch (err) {
    error = err.message;
  }

  const porId = new Map(clientes.map((c) => [c.id, c]));
  const negociosConEstado = registro.map((n) => ({
    ...n,
    configurado: Boolean(n.customerId),
    enElMCC: Boolean(n.customerId && porId.has(n.customerId)),
    detalle: n.customerId ? porId.get(n.customerId) || null : null,
  }));

  const idsRegistrados = new Set(registro.map((n) => n.customerId).filter(Boolean));
  const sinAsignar = clientes.filter(
    (c) => !idsRegistrados.has(c.id) && !c.esAdministradora
  );

  return { negocios: negociosConEstado, sinAsignar, error };
}

module.exports = { listarAccesibles, listarClientesDelMCC, crearCuenta, estado };
