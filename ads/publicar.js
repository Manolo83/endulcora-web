'use strict';

// Crea en Meta Ads las campañas de una cuenta a partir de su archivo de config.
//
//   node ads/publicar.js instituto-justo                 # solo muestra el plan
//   node ads/publicar.js instituto-justo --publicar      # las crea EN PAUSA
//   node ads/publicar.js instituto-justo --publicar --activar
//   node ads/publicar.js instituto-justo --solo=regularizacion,admision
//
// Sin --publicar no toca la API: imprime exactamente lo que se va a crear.

// dotenv es dependencia del proyecto, pero el script también sirve suelto
// (con las variables ya exportadas en la terminal).
try {
  require('dotenv').config();
} catch {
  /* sin .env: se usan las variables de entorno tal cual */
}

const fs = require('fs');
const path = require('path');

const api = require('./lib/meta-api');
const { planDeCuenta } = require('./lib/plantilla');

const DIR_CUENTAS = path.join(__dirname, 'cuentas');
const DIR_CREATIVOS = path.join(__dirname, 'creativos');
const DIR_SALIDAS = path.join(__dirname, 'salidas');

function leeArgumentos(argv) {
  const opciones = { cuenta: null, publicar: false, activar: false, solo: null };
  for (const arg of argv) {
    if (arg === '--publicar') opciones.publicar = true;
    else if (arg === '--activar') opciones.activar = true;
    else if (arg.startsWith('--solo=')) opciones.solo = arg.slice(7).split(',').filter(Boolean);
    else if (!arg.startsWith('--') && !opciones.cuenta) opciones.cuenta = arg;
  }
  return opciones;
}

function cuentasDisponibles() {
  return fs
    .readdirSync(DIR_CUENTAS)
    .filter((f) => f.endsWith('.js'))
    .map((f) => f.replace(/\.js$/, ''));
}

function pesos(centavos) {
  return `$${(Number(centavos || 0) / 100).toLocaleString('es-MX')} MXN`;
}

// Revisa lo que Meta va a rechazar, antes de mandarlo.
function revisa(plan, cuenta) {
  const problemas = [];
  if (!plan.conjunto.daily_budget) {
    problemas.push('sin presupuesto diario');
  }
  if (!plan.creativo.objectStorySpec.link_data.message) {
    problemas.push('sin texto del anuncio');
  }
  if (!plan.creativo.imageHash) {
    const ruta = path.join(DIR_CREATIVOS, cuenta.clave, plan.creativo.imagen || '');
    if (!plan.creativo.imagen) problemas.push('sin imagen definida en la config');
    else if (!fs.existsSync(ruta)) problemas.push(`falta la imagen ${path.relative(process.cwd(), ruta)}`);
  }
  return problemas;
}

function imprimePlan(planes, cuenta) {
  console.log(`\n${cuenta.nombre} · cuenta ${cuenta.cuentaId} · página ${cuenta.pageId}`);
  console.log(`Destino de los mensajes: ${plan0Destino(planes)}\n`);

  let total = 0;
  for (const plan of planes) {
    const problemas = revisa(plan, cuenta);
    const t = plan.conjunto.targeting;
    const generos = t.genders ? (t.genders.includes(2) ? 'mujeres' : 'hombres') : 'todos';
    total += Number(plan.conjunto.daily_budget || 0);

    console.log(`  ${plan.campana.name}`);
    console.log(`    conjunto   ${plan.conjunto.name}`);
    console.log(`    presupuesto ${pesos(plan.conjunto.daily_budget)} al día`);
    console.log(`    público    ${generos}, ${t.age_min}-${t.age_max} años, ${plan.sede.radioKm ?? 7} km de ${plan.sede.nombre}`);
    const desde = plan.conjunto.start_time ? plan.conjunto.start_time.slice(0, 10) : 'hoy';
    const hasta = plan.conjunto.end_time ? plan.conjunto.end_time.slice(0, 10) : 'sin fecha de fin';
    console.log(`    corre      ${desde} → ${hasta}`);
    console.log(`    enlace     ${plan.enlace}`);
    console.log(`    imagen     ${plan.creativo.imageHash ? `hash ${plan.creativo.imageHash}` : plan.creativo.imagen || '—'}`);
    if (problemas.length) console.log(`    ⚠ falta:   ${problemas.join('; ')}`);
    console.log('');
  }

  console.log(`  ${planes.length} campañas · ${pesos(total)} al día si todas se activan\n`);
}

function plan0Destino(planes) {
  const destinos = [...new Set(planes.map((p) => p.destino))];
  return destinos.join(' + ');
}

async function creaUnaCampana(plan, cuenta, { activar }) {
  const estado = activar ? 'ACTIVE' : 'PAUSED';
  const cuentaId = cuenta.cuentaId;

  // 1. Imagen (si no venía ya un hash en la config).
  let imageHash = plan.creativo.imageHash;
  if (!imageHash) {
    const ruta = path.join(DIR_CREATIVOS, cuenta.clave, plan.creativo.imagen);
    imageHash = await api.subeImagen(cuentaId, ruta);
    console.log(`    imagen subida  ${plan.creativo.imagen} → ${imageHash}`);
  }

  // 2. Campaña.
  const campana = await api.crearCampana(cuentaId, { ...plan.campana, status: estado });
  console.log(`    campaña        ${campana.id}`);

  // 3. Conjunto de anuncios.
  const conjunto = await api.crearConjunto(cuentaId, {
    ...plan.conjunto,
    campaign_id: campana.id,
    status: estado,
  });
  console.log(`    conjunto       ${conjunto.id}`);

  // 4. Creativo.
  const spec = JSON.parse(JSON.stringify(plan.creativo.objectStorySpec));
  spec.link_data.image_hash = imageHash;
  const creativo = await api.crearCreativo(cuentaId, {
    name: plan.creativo.name,
    object_story_spec: spec,
  });
  console.log(`    creativo       ${creativo.id}`);

  // 5. Anuncio.
  const anuncio = await api.crearAnuncio(cuentaId, {
    name: plan.anuncio.name,
    adset_id: conjunto.id,
    creative: { creative_id: creativo.id },
    status: estado,
  });
  console.log(`    anuncio        ${anuncio.id}`);

  return {
    clave: plan.clave,
    nombre: plan.campana.name,
    estado,
    campanaId: campana.id,
    conjuntoId: conjunto.id,
    creativoId: creativo.id,
    anuncioId: anuncio.id,
    imageHash,
  };
}

async function main() {
  const opciones = leeArgumentos(process.argv.slice(2));

  if (!opciones.cuenta) {
    console.error('Uso: node ads/publicar.js <cuenta> [--publicar] [--activar] [--solo=clave1,clave2]');
    console.error(`Cuentas disponibles: ${cuentasDisponibles().join(', ')}`);
    process.exit(1);
  }

  const rutaCuenta = path.join(DIR_CUENTAS, `${opciones.cuenta}.js`);
  if (!fs.existsSync(rutaCuenta)) {
    console.error(`No existe la cuenta "${opciones.cuenta}". Disponibles: ${cuentasDisponibles().join(', ')}`);
    process.exit(1);
  }

  const cuenta = require(rutaCuenta);
  const planes = planDeCuenta(cuenta, { soloOfertas: opciones.solo });

  if (!planes.length) {
    console.error('El filtro --solo no coincidió con ninguna oferta.');
    process.exit(1);
  }

  imprimePlan(planes, cuenta);

  if (!opciones.publicar) {
    console.log('Esto fue una revisión en seco. Agrega --publicar para crearlas en Meta.\n');
    return;
  }

  const conProblemas = planes.filter((p) => revisa(p, cuenta).length);
  if (conProblemas.length) {
    console.error('No publico nada: hay campañas incompletas (ver ⚠ arriba).');
    process.exit(1);
  }

  console.log(
    opciones.activar
      ? 'Creando campañas ACTIVAS (empiezan a gastar en cuanto Meta las apruebe)...\n'
      : 'Creando campañas EN PAUSA (revísalas en Ads Manager antes de activarlas)...\n'
  );

  const resultados = [];
  for (const plan of planes) {
    console.log(`  ${plan.campana.name}`);
    try {
      resultados.push(await creaUnaCampana(plan, cuenta, { activar: opciones.activar }));
    } catch (err) {
      console.error(`    ✗ ${err.message}`);
      resultados.push({ clave: plan.clave, nombre: plan.campana.name, error: err.message });
    }
    console.log('');
  }

  fs.mkdirSync(DIR_SALIDAS, { recursive: true });
  const sello = new Date().toISOString().replace(/[:.]/g, '-');
  const salida = path.join(DIR_SALIDAS, `${cuenta.clave}-${sello}.json`);
  fs.writeFileSync(salida, JSON.stringify({ cuenta: cuenta.clave, resultados }, null, 2));

  const ok = resultados.filter((r) => !r.error).length;
  console.log(`${ok} de ${resultados.length} campañas creadas. Detalle: ${path.relative(process.cwd(), salida)}`);
  if (ok < resultados.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(`\n${err.message}\n`);
  process.exit(1);
});
