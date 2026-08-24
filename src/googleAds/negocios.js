// Registro de los negocios que anunciamos en Google Ads.
//
// Cada negocio tiene su PROPIA cuenta de Google Ads (su presupuesto, su
// facturacion y sus campanas por separado), pero todas cuelgan de la misma
// cuenta administradora (MCC) para poder verlas y moverlas desde un solo
// lugar: este servidor.
//
// El ID de cada cuenta (10 digitos, sin guiones) viene aqui de fabrica, con el
// valor real de la cuenta que ya existe dentro del MCC. No es un secreto: es
// el numero que se ve en la interfaz. La variable de entorno correspondiente,
// si se define, tiene prioridad (util para apuntar a otra cuenta sin tocar el
// codigo).

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
    // 718-083-5807
    idPorDefecto: '7180835807',
    envCuenta: 'GOOGLE_ADS_CUSTOMER_ENDULCORA',
  },
  {
    clave: 'crenef',
    nombre: 'CRENEF',
    descripcion: 'CRENEF',
    sitio: process.env.GOOGLE_ADS_SITIO_CRENEF || '',
    moneda: process.env.GOOGLE_ADS_MONEDA_CRENEF || 'MXN',
    zona: process.env.GOOGLE_ADS_ZONA_CRENEF || 'America/Mexico_City',
    // 905-783-5688
    idPorDefecto: '9057835688',
    envCuenta: 'GOOGLE_ADS_CUSTOMER_CRENEF',
  },
  {
    clave: 'levent',
    nombre: 'LEVENT',
    descripcion: 'LEVENT',
    sitio: process.env.GOOGLE_ADS_SITIO_LEVENT || '',
    moneda: process.env.GOOGLE_ADS_MONEDA_LEVENT || 'MXN',
    zona: process.env.GOOGLE_ADS_ZONA_LEVENT || 'America/Mexico_City',
    // 699-233-5000
    idPorDefecto: '6992335000',
    envCuenta: 'GOOGLE_ADS_CUSTOMER_LEVENT',
  },
  {
    clave: 'instituto-justo',
    nombre: 'Instituto Justo',
    descripcion: 'Instituto Justo',
    sitio: process.env.GOOGLE_ADS_SITIO_INSTITUTO_JUSTO || '',
    moneda: process.env.GOOGLE_ADS_MONEDA_INSTITUTO_JUSTO || 'MXN',
    zona: process.env.GOOGLE_ADS_ZONA_INSTITUTO_JUSTO || 'America/Mexico_City',
    // 291-986-6811
    idPorDefecto: '2919866811',
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

// ID de la cuenta de Google Ads del negocio (10 digitos sin guiones). Manda la
// variable de entorno; si no esta, se usa el ID real que ya trae el registro.
function customerId(clave) {
  const negocio = NEGOCIOS.find((n) => n.clave === clave);
  if (!negocio) return '';
  return soloDigitos(process.env[negocio.envCuenta]) || soloDigitos(negocio.idPorDefecto);
}

module.exports = { NEGOCIOS, listar, obtener, customerId, soloDigitos };
