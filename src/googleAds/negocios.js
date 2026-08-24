// Registro de los negocios que anunciamos en Google Ads.
//
// Cada negocio tiene su PROPIA cuenta de Google Ads (su presupuesto, su
// facturacion y sus campanas por separado), pero todas cuelgan de la misma
// cuenta administradora (MCC) para poder verlas y moverlas desde un solo
// lugar: este servidor.
//
// El ID de cada cuenta (10 digitos, sin guiones) se guarda en una variable de
// entorno para no tener que tocar el codigo cada vez que se crea una cuenta.

function soloDigitos(valor) {
  return String(valor || '').replace(/\D/g, '');
}

const NEGOCIOS = [
  {
    clave: 'endulcora',
    nombre: 'Endulcora',
    descripcion: 'Endulcora - Estudio Gastronomico',
    sitio: process.env.GOOGLE_ADS_SITIO_ENDULCORA || 'https://www.endulcora.com',
    moneda: process.env.GOOGLE_ADS_MONEDA_ENDULCORA || 'MXN',
    zona: process.env.GOOGLE_ADS_ZONA_ENDULCORA || 'America/Mexico_City',
    envCuenta: 'GOOGLE_ADS_CUSTOMER_ENDULCORA',
  },
  {
    clave: 'crenef',
    nombre: 'CRENEF',
    descripcion: 'CRENEF',
    sitio: process.env.GOOGLE_ADS_SITIO_CRENEF || '',
    moneda: process.env.GOOGLE_ADS_MONEDA_CRENEF || 'MXN',
    zona: process.env.GOOGLE_ADS_ZONA_CRENEF || 'America/Mexico_City',
    envCuenta: 'GOOGLE_ADS_CUSTOMER_CRENEF',
  },
  {
    clave: 'levent',
    nombre: 'LEVENT',
    descripcion: 'LEVENT',
    sitio: process.env.GOOGLE_ADS_SITIO_LEVENT || '',
    moneda: process.env.GOOGLE_ADS_MONEDA_LEVENT || 'MXN',
    zona: process.env.GOOGLE_ADS_ZONA_LEVENT || 'America/Mexico_City',
    envCuenta: 'GOOGLE_ADS_CUSTOMER_LEVENT',
  },
  {
    clave: 'instituto-justo',
    nombre: 'Instituto Justo',
    descripcion: 'Instituto Justo',
    sitio: process.env.GOOGLE_ADS_SITIO_INSTITUTO_JUSTO || '',
    moneda: process.env.GOOGLE_ADS_MONEDA_INSTITUTO_JUSTO || 'MXN',
    zona: process.env.GOOGLE_ADS_ZONA_INSTITUTO_JUSTO || 'America/Mexico_City',
    envCuenta: 'GOOGLE_ADS_CUSTOMER_INSTITUTO_JUSTO',
  },
];

function listar() {
  return NEGOCIOS.map((negocio) => ({ ...negocio, customerId: customerId(negocio.clave) }));
}

function obtener(clave) {
  const buscada = String(clave || '').trim().toLowerCase();
  const negocio = NEGOCIOS.find((n) => n.clave === buscada || n.nombre.toLowerCase() === buscada);
  if (!negocio) {
    const claves = NEGOCIOS.map((n) => n.clave).join(', ');
    throw new Error(`No conozco el negocio "${clave}". Los que tengo registrados son: ${claves}.`);
  }
  return { ...negocio, customerId: customerId(negocio.clave) };
}

// ID de la cuenta de Google Ads del negocio (10 digitos sin guiones), o cadena
// vacia si todavia no se ha creado / configurado.
function customerId(clave) {
  const negocio = NEGOCIOS.find((n) => n.clave === clave);
  if (!negocio) return '';
  return soloDigitos(process.env[negocio.envCuenta]);
}

module.exports = { NEGOCIOS, listar, obtener, customerId, soloDigitos };
