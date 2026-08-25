#!/usr/bin/env node
// Herramienta de linea de comandos para administrar las cuentas de Google Ads
// de los cuatro negocios desde este mismo servidor.
//
//   node scripts/google-ads.js ayuda
//
// Todo lo que hace esta herramienta usa las credenciales de la cuenta
// administradora (MCC), asi que no hace falta entrar a la interfaz de Google
// para las tareas del dia a dia.

// dotenv solo existe cuando ya se instalaron las dependencias; sin el, se usan
// las variables del entorno tal cual (que es como corre en Railway).
try {
  require('dotenv').config();
} catch {
  /* sin dotenv: seguimos con process.env */
}

const { GOOGLE_ADS } = require('../src/config');
const api = require('../src/googleAds/api');
const negocios = require('../src/googleAds/negocios');
const cuentas = require('../src/googleAds/cuentas');
const conversiones = require('../src/googleAds/conversiones');
const reportes = require('../src/googleAds/reportes');

const REDIRECT_URI = process.env.GOOGLE_ADS_REDIRECT_URI || 'http://localhost:8080';
const SCOPE = 'https://www.googleapis.com/auth/adwords';

function dinero(n, moneda = 'MXN') {
  return `${Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${moneda}`;
}

function ayuda() {
  console.log(`
Google Ads - administracion de los cuatro negocios
==================================================

  node scripts/google-ads.js <comando> [opciones]

Permisos (solo la primera vez)
  permiso                     Imprime el enlace para conceder el acceso. Se abre, se acepta,
                              y el servidor guarda el permiso solo.
  olvidar-permiso             Borra el permiso guardado.
  url-permiso                 Variante manual (cliente OAuth de escritorio).
  refresh-token <codigo>      Completa la variante manual.

Cuentas
  estado                      Que negocio ya tiene cuenta y cual falta.
  cuentas                     Lista las cuentas que cuelgan de la administradora (MCC).
  crear-cuenta <negocio>      Crea la cuenta de Google Ads de ese negocio dentro del MCC.

Conversiones
  conversiones <negocio>            Lista las acciones de conversion y sus etiquetas.
  crear-conversiones <negocio>      Da de alta las acciones de conversion estandar.

Resultados
  reporte [negocio] [dias]    Gasto y resultados (por omision: todos, 30 dias).

Negocios registrados: ${negocios.NEGOCIOS.map((n) => n.clave).join(', ')}
`);
}

async function comandoUrlPermiso() {
  if (!GOOGLE_ADS.clientId) {
    console.error('Falta GOOGLE_ADS_CLIENT_ID. Crea un cliente OAuth de tipo "Aplicacion de escritorio" (ver docs/google-ads.md).');
    process.exitCode = 1;
    return;
  }
  const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id: GOOGLE_ADS.clientId,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
  });
  console.log(`
1) Abre este enlace con la cuenta de Google DUENA del MCC:

${url}

2) Acepta los permisos. El navegador terminara en una pagina que no carga
   (${REDIRECT_URI}/?code=...). Eso es normal.
3) Copia el valor de "code=" de la barra de direcciones y corre:

   node scripts/google-ads.js refresh-token <ese-codigo>
`);
}

async function comandoRefreshToken(codigo) {
  if (!codigo) {
    console.error('Falta el codigo. Uso: node scripts/google-ads.js refresh-token <codigo>');
    process.exitCode = 1;
    return;
  }
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: decodeURIComponent(codigo),
      client_id: GOOGLE_ADS.clientId,
      client_secret: GOOGLE_ADS.clientSecret,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.refresh_token) {
    console.error('Google no devolvio un refresh token:', JSON.stringify(data));
    console.error('Si dice "invalid_grant", el codigo ya se uso o expiro: vuelve a correr url-permiso.');
    process.exitCode = 1;
    return;
  }
  console.log(`
Listo. Guarda esto en Railway (Variables) y en tu .env local:

GOOGLE_ADS_REFRESH_TOKEN=${data.refresh_token}

No caduca; tratalo como una contrasena.
`);
}

// Imprime el enlace que hay que abrir una sola vez para conceder el permiso.
async function comandoPermiso() {
  const store = require('../src/store');
  const permiso = require('../src/googleAds/permiso');

  const { url, redirectUri, vigenciaMinutos } = permiso.generarEnlace();
  await store.flush(); // que el "state" quede guardado antes de salir

  console.log(`
Abre este enlace con la cuenta de Google duenia de la administradora y dale
"Permitir". El servidor guarda el permiso solo: no hay que copiar nada de vuelta.

${url}

Dura ${vigenciaMinutos} minutos y sirve una sola vez.
Regresa a: ${redirectUri}
`);
}

async function comandoOlvidarPermiso() {
  const store = require('../src/store');
  require('../src/googleAds/permiso').olvidarPermiso();
  await store.flush();
  console.log('\nPermiso borrado. Habra que volver a concederlo con "permiso" para operar las cuentas.\n');
}

async function comandoEstado() {
  const falta = api.faltantes();
  console.log('\nCredenciales');
  console.log(falta.length ? `  Faltan: ${falta.join(', ')}` : '  Completas.');
  console.log(`  Cuenta administradora (MCC): ${GOOGLE_ADS.managerId || '(sin configurar)'}`);
  console.log(`  Version de la API: ${GOOGLE_ADS.apiVersion}`);
  try {
    const permiso = require('../src/googleAds/permiso');
    console.log(`  Permiso de Google: ${permiso.permisoGuardado() ? 'concedido' : 'pendiente (corre "permiso")'}`);
  } catch {
    console.log('  Permiso de Google: no se pudo leer (sin base de datos)');
  }

  console.log('\nNegocios');
  if (falta.length) {
    for (const n of negocios.listar()) {
      console.log(`  ${n.nombre.padEnd(18)} ${n.customerId || '(sin cuenta)'}   variable: ${n.envCuenta}`);
    }
    console.log('\n  Configura las credenciales para poder consultar el MCC (ver docs/google-ads.md).');
    return;
  }

  const { negocios: lista, sinAsignar, error } = await cuentas.estado();
  for (const n of lista) {
    const marca = n.enElMCC ? 'OK  ' : n.configurado ? 'REV ' : 'FALTA';
    const detalle = n.detalle ? `${n.detalle.nombre} - ${n.detalle.moneda} - ${n.detalle.zona} - ${n.detalle.estado}` : '';
    console.log(`  [${marca}] ${n.nombre.padEnd(18)} ${(n.customerId || '-').padEnd(12)} ${detalle}`);
  }
  if (error) console.log(`\n  No pude leer el MCC: ${error}`);
  if (sinAsignar.length) {
    console.log('\nCuentas dentro del MCC que no estan asignadas a ningun negocio:');
    for (const c of sinAsignar) console.log(`  ${c.id}  ${c.nombre} (${c.moneda}, ${c.estado})`);
  }
  console.log('');
}

async function comandoCuentas() {
  const accesibles = await cuentas.listarAccesibles();
  console.log('\nCuentas a las que llega este acceso:');
  for (const id of accesibles) console.log(`  ${id}`);

  const clientes = await cuentas.listarClientesDelMCC();
  console.log(`\nCuentas dentro del MCC ${GOOGLE_ADS.managerId}:`);
  for (const c of clientes) {
    const etiqueta = c.esAdministradora ? '[administradora]' : '';
    console.log(`  ${c.id.padEnd(12)} ${(c.nombre || '(sin nombre)').padEnd(30)} ${c.moneda} ${c.zona} ${c.estado} ${etiqueta}`);
  }
  console.log('');
}

async function comandoCrearCuenta(clave) {
  if (!clave) {
    console.error(`Falta el negocio. Uso: node scripts/google-ads.js crear-cuenta <${negocios.NEGOCIOS.map((n) => n.clave).join('|')}>`);
    process.exitCode = 1;
    return;
  }
  const negocio = negocios.obtener(clave);
  if (negocio.customerId) {
    console.log(`${negocio.nombre} ya tiene la cuenta ${negocio.customerId} configurada en ${negocio.envCuenta}.`);
    console.log('Si de verdad quieres otra cuenta, borra primero esa variable.');
    return;
  }
  console.log(`Creando la cuenta de ${negocio.nombre} (${negocio.moneda}, ${negocio.zona}) dentro del MCC ${GOOGLE_ADS.managerId}...`);
  const creada = await cuentas.crearCuenta(clave);
  console.log(`
Cuenta creada: ${creada.id}  (${creada.nombre})

Guarda esto en Railway (Variables) y en tu .env local:

${creada.variableDeEntorno}

Pendiente y solo se hace desde la interfaz de Google: agregarle la forma de
pago en Facturacion. Sin eso la cuenta existe pero no publica anuncios.
`);
}

async function comandoConversiones(clave) {
  const negocio = negocios.obtener(clave);
  const acciones = await conversiones.listarAcciones(clave);
  if (!acciones.length) {
    console.log(`\n${negocio.nombre} no tiene acciones de conversion todavia. Creelas con:`);
    console.log(`  node scripts/google-ads.js crear-conversiones ${negocio.clave}\n`);
    return;
  }
  console.log(`\nConversiones de ${negocio.nombre} (cuenta ${negocio.customerId}):`);
  for (const a of acciones) {
    console.log(`  ${a.id.padEnd(12)} ${a.nombre.padEnd(28)} ${a.categoria.padEnd(18)} ${a.estado.padEnd(9)} ${a.etiqueta}`);
  }
  console.log('\n  El ID sirve para subir conversiones desde el servidor; la etiqueta (AW-.../...) para el sitio web.\n');
}

async function comandoCrearConversiones(clave) {
  const negocio = negocios.obtener(clave);
  const r = await conversiones.crearAccionesEstandar(clave);
  console.log(`\n${negocio.nombre}:`);
  console.log(`  Creadas: ${r.creadas.length ? r.creadas.join(', ') : 'ninguna (ya existian)'}`);
  if (r.omitidas.length) console.log(`  Ya existian: ${r.omitidas.join(', ')}`);
  const compra = r.acciones.find((a) => /compra \(web\)/i.test(a.nombre));
  if (compra) {
    console.log(`
Para medir la compra en el sitio, guarda en Railway:

GOOGLE_ADS_CONVERSION_COMPRA=${compra.etiqueta || '(vuelve a correr "conversiones" en unos minutos)'}
GOOGLE_ADS_CONVERSION_COMPRA_ID=${compra.id}
`);
  }
}

async function comandoReporte(clave, dias) {
  const n = parseInt(dias, 10) || 30;
  const lista = clave ? [await reportes.rendimiento(clave, n)] : await reportes.resumenGeneral(n);

  for (const r of lista) {
    console.log(`\n=== ${r.nombre} (ultimos ${n} dias) ===`);
    if (r.error) { console.log(`  Error: ${r.error}`); continue; }
    if (r.sinCuenta) { console.log('  Todavia no tiene cuenta de Google Ads configurada.'); continue; }
    if (!r.campanas.length) { console.log('  Sin datos en el periodo (o sin campanas activas).'); continue; }

    for (const c of r.campanas) {
      console.log(`  ${c.nombre.padEnd(32)} ${String(c.impresiones).padStart(8)} impr  ${String(c.clics).padStart(6)} clics  ${dinero(c.costo, r.moneda).padStart(16)}  ${c.conversiones} conv`);
    }
    const t = r.totales;
    console.log(`  ${'TOTAL'.padEnd(32)} ${String(t.impresiones).padStart(8)} impr  ${String(t.clics).padStart(6)} clics  ${dinero(t.costo, r.moneda).padStart(16)}  ${t.conversiones} conv  CPA ${dinero(t.cpa, r.moneda)}  ROAS ${t.roas}`);
  }
  console.log('');
}

async function main() {
  const [comando, ...args] = process.argv.slice(2);

  // El permiso vive en la base de datos, asi que se carga antes de nada. Si no
  // hay base de datos (por ejemplo al correr esto fuera del servidor), se sigue
  // adelante con lo que haya en las variables de entorno.
  try {
    await require('../src/store').init();
  } catch (err) {
    if (!['ayuda', '--help', '-h', undefined].includes(comando)) {
      console.log(`[aviso] Sin base de datos (${err.message.split('\n')[0]}); solo se usaran las variables de entorno.\n`);
    }
  }
  switch ((comando || 'ayuda').toLowerCase()) {
    case 'permiso': return comandoPermiso();
    case 'olvidar-permiso': return comandoOlvidarPermiso();
    case 'url-permiso': return comandoUrlPermiso();
    case 'refresh-token': return comandoRefreshToken(args[0]);
    case 'estado': return comandoEstado();
    case 'cuentas': return comandoCuentas();
    case 'crear-cuenta': return comandoCrearCuenta(args[0]);
    case 'conversiones': return comandoConversiones(args[0]);
    case 'crear-conversiones': return comandoCrearConversiones(args[0]);
    case 'reporte': return comandoReporte(args[0], args[1]);
    case 'ayuda':
    case '--help':
    case '-h': return ayuda();
    default:
      console.error(`No conozco el comando "${comando}".`);
      ayuda();
      process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(`\nError: ${err.message}\n`);
  process.exitCode = 1;
});
