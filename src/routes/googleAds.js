// Panel de administracion de Google Ads por HTTP.
//
// Sirve para operar las cuentas de los cuatro negocios desde fuera del
// servidor (por ejemplo, desde Claude) sin que las credenciales de Google
// salgan nunca de Railway: aqui solo viaja un token propio, que se puede
// cambiar cuando se quiera sin tocar nada de Google.
//
// Todas las rutas viven bajo /api/google-ads y exigen el encabezado:
//   Authorization: Bearer <GOOGLE_ADS_ADMIN_TOKEN>

const crypto = require('crypto');
const express = require('express');

const api = require('../googleAds/api');
const negocios = require('../googleAds/negocios');
const cuentas = require('../googleAds/cuentas');
const conversiones = require('../googleAds/conversiones');
const reportes = require('../googleAds/reportes');
const { GOOGLE_ADS } = require('../config');

const router = express.Router();

const ADMIN_TOKEN = process.env.GOOGLE_ADS_ADMIN_TOKEN || '';

// Comparacion en tiempo constante: evita que se pueda adivinar el token
// midiendo cuanto tarda la respuesta.
function tokenValido(recibido) {
  if (!ADMIN_TOKEN || !recibido) return false;
  const a = Buffer.from(String(recibido));
  const b = Buffer.from(ADMIN_TOKEN);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');

  if (!ADMIN_TOKEN) {
    return res.status(503).json({
      error: 'El panel de Google Ads no esta activado. Define GOOGLE_ADS_ADMIN_TOKEN en las variables del servidor.',
    });
  }

  const cabecera = req.get('authorization') || '';
  const recibido = cabecera.startsWith('Bearer ') ? cabecera.slice(7).trim() : req.get('x-ads-token');
  if (!tokenValido(recibido)) {
    return res.status(401).json({ error: 'Token invalido.' });
  }
  next();
});

// Envuelve un manejador async para que cualquier error de Google salga como
// JSON y no tumbe el proceso.
function ruta(manejador) {
  return (req, res) => {
    Promise.resolve(manejador(req, res)).catch((err) => {
      console.error('[google-ads] Error en el panel:', err.message);
      if (!res.headersSent) res.status(502).json({ error: err.message });
    });
  };
}

// Que hay configurado y que falta. Nunca devuelve credenciales, solo cuales
// estan puestas.
router.get('/estado', ruta(async (req, res) => {
  const falta = api.faltantes();
  const base = {
    credencialesCompletas: falta.length === 0,
    faltantes: falta,
    cuentaAdministradora: GOOGLE_ADS.managerId || null,
    versionApi: GOOGLE_ADS.apiVersion,
    medicionSitio: {
      googleAdsId: GOOGLE_ADS.medicionId || null,
      conversionCompra: GOOGLE_ADS.conversionCompra || null,
      conversionCompraId: GOOGLE_ADS.conversionCompraId || null,
    },
  };

  if (falta.length) {
    return res.json({ ...base, negocios: negocios.listar().map((n) => ({
      clave: n.clave, nombre: n.nombre, customerId: n.customerId || null, variable: n.envCuenta,
    })) });
  }

  const estado = await cuentas.estado();
  res.json({ ...base, ...estado });
}));

router.get('/cuentas', ruta(async (req, res) => {
  const [accesibles, clientes] = await Promise.all([
    cuentas.listarAccesibles(),
    cuentas.listarClientesDelMCC(),
  ]);
  res.json({ accesibles, clientes });
}));

// Crea la cuenta de un negocio dentro del MCC.
router.post('/cuentas', ruta(async (req, res) => {
  const { negocio, moneda, zona, nombre } = req.body || {};
  if (!negocio) return res.status(400).json({ error: 'Falta el campo "negocio".' });

  const registro = negocios.obtener(negocio);
  if (registro.customerId) {
    return res.status(409).json({
      error: `${registro.nombre} ya tiene la cuenta ${registro.customerId} configurada en ${registro.envCuenta}.`,
    });
  }

  const creada = await cuentas.crearCuenta(negocio, { moneda, zona, nombre });
  res.status(201).json({
    ...creada,
    siguiente: `Guarda "${creada.variableDeEntorno}" en las variables del servidor y agrega la forma de pago desde la interfaz de Google Ads.`,
  });
}));

router.get('/conversiones/:negocio', ruta(async (req, res) => {
  const acciones = await conversiones.listarAcciones(req.params.negocio);
  res.json({ negocio: negocios.obtener(req.params.negocio).clave, acciones });
}));

router.post('/conversiones/:negocio', ruta(async (req, res) => {
  const resultado = await conversiones.crearAccionesEstandar(req.params.negocio);
  res.status(201).json(resultado);
}));

router.get('/reporte', ruta(async (req, res) => {
  const dias = parseInt(req.query.dias, 10) || 30;
  const datos = req.query.negocio
    ? [await reportes.rendimiento(req.query.negocio, dias)]
    : await reportes.resumenGeneral(dias);
  res.json({ dias, negocios: datos });
}));

// Consulta libre de solo lectura (GAQL), para preguntas que no cubren las
// rutas de arriba. Se rechaza cualquier cosa que no sea un SELECT.
router.post('/consulta', ruta(async (req, res) => {
  const { negocio, query } = req.body || {};
  if (!query || !/^\s*select\b/i.test(query)) {
    return res.status(400).json({ error: 'Solo se permiten consultas que empiecen con SELECT.' });
  }

  const registro = negocio ? negocios.obtener(negocio) : null;
  const cuenta = registro ? registro.customerId : GOOGLE_ADS.managerId;
  if (!cuenta) return res.status(400).json({ error: 'Esa cuenta todavia no esta configurada.' });

  const filas = await api.buscar(cuenta, query);
  res.json({ cuenta, filas: filas.slice(0, 500), total: filas.length });
}));

module.exports = router;
