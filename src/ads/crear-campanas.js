#!/usr/bin/env node
// Crea en Meta Ads las campañas de terapias de Crenef.
//
//   npm run ads:crenef              enseña qué se va a crear, sin tocar Meta
//   npm run ads:crenef -- --crear   lo crea de verdad, todo EN PAUSA
//   npm run ads:crenef -- --crear --forzar   crea aunque el copy tenga avisos
//
// Nada se prende solo: campañas, conjuntos y anuncios nacen en PAUSED para que
// los revises en el Administrador de anuncios antes de gastar un peso.

const fs = require('fs');
const path = require('path');

const { CRENEF, revisarConfig } = require('./crenef.config');
const { revisarCopy } = require('./politicas-salud');
const machote = require('./machote');
const api = require('./meta-api');

function plan(config) {
  const tareas = [];
  for (const terapia of config.terapias) {
    for (const claveSucursal of terapia.sucursales) {
      const sucursal = config.sucursales[claveSucursal];
      tareas.push({
        terapia: terapia.nombre,
        sucursal,
        inicio: terapia.inicio,
        fin: terapia.fin || null,
        imagen: terapia.imagen,
        copy: terapia.copy,
        mensajeInicial: terapia.mensajeInicial,
        edadMin: terapia.edadMin,
        edadMax: terapia.edadMax,
        ubicaciones: terapia.ubicaciones || 'automaticas',
        campana: machote.nombreDeCampana({
          terapia: terapia.nombre,
          sucursal: sucursal.nombre,
          fin: terapia.fin,
        }),
        creativo: machote.nombreDeCreativo({
          terapia: terapia.nombre,
          sucursal,
          fin: terapia.fin,
        }),
      });
    }
  }
  return tareas;
}

function mostrarPlan(config, tareas) {
  const gastoDiario = tareas.length * (config.presupuestoDiarioMxn || machote.MACHOTE.presupuestoDiarioMxn);
  console.log(`\nPlan para ${config.marca} — ${tareas.length} campaña(s), $${gastoDiario} MXN al día en total:\n`);

  for (const t of tareas) {
    const radio = t.sucursal.radioKm || machote.MACHOTE.radioKm;
    const edades = `${t.edadMin || machote.MACHOTE.edadMin}-${t.edadMax || machote.MACHOTE.edadMax} años`;
    const vigencia = t.fin ? `${t.inicio.slice(0, 16)} → ${t.fin.slice(0, 16)}` : `${t.inicio.slice(0, 16)} → sin fecha de fin`;

    console.log(`  ${t.campana}`);
    console.log(`    conjunto  ${t.terapia} · ${t.sucursal.nombre} · radio ${radio} km · ${edades} · ${t.ubicaciones}`);
    console.log(`    corre     ${vigencia}`);
    console.log(`    anuncio   ${t.creativo} · imagen ${path.basename(t.imagen)}\n`);
  }
}

// Revisa los copys contra la política de salud de Meta. Devuelve true si todo
// está limpio.
function mostrarRevisionDeCopys(tareas) {
  const conProblemas = tareas
    .map((t) => ({ tarea: t, hallazgos: revisarCopy(t.copy) }))
    .filter((r) => r.hallazgos.length);

  if (!conProblemas.length) {
    console.log('Revisión de política de salud de Meta: los copys están limpios.\n');
    return true;
  }

  console.log('AVISOS de política de salud de Meta (esto es lo que hace que rechacen anuncios de clínica):\n');
  for (const { tarea, hallazgos } of conProblemas) {
    console.log(`  ${tarea.campana}`);
    for (const h of hallazgos) {
      console.log(`    · "${h.fragmento}"`);
      console.log(`      ${h.mensaje}`);
    }
    console.log('');
  }
  return false;
}

// Sube cada imagen una sola vez aunque la usen varias terapias.
async function hashDeImagen(cacheHashes, cuentaId, rutaImagen) {
  if (cacheHashes.has(rutaImagen)) return cacheHashes.get(rutaImagen);

  const ruta = path.isAbsolute(rutaImagen) ? rutaImagen : path.join(__dirname, '..', '..', rutaImagen);
  if (!fs.existsSync(ruta)) throw new Error(`No encuentro la imagen ${rutaImagen} (busqué en ${ruta}).`);

  const hash = await api.subirImagen(cuentaId, path.basename(ruta), fs.readFileSync(ruta));
  cacheHashes.set(rutaImagen, hash);
  return hash;
}

async function crearTodo(config, tareas) {
  const cuentaId = config.cuentaPublicitariaId;
  const cacheHashes = new Map();
  const creadas = [];

  for (const t of tareas) {
    console.log(`Creando "${t.campana}"...`);

    const campana = await api.crearCampana(
      cuentaId,
      machote.payloadDeCampana({ terapia: t.terapia, sucursal: t.sucursal.nombre, fin: t.fin })
    );

    const conjunto = await api.crearConjunto(
      cuentaId,
      machote.payloadDeConjunto({
        campanaId: campana.id,
        terapia: t.terapia,
        sucursal: t.sucursal,
        inicio: t.inicio,
        fin: t.fin,
        ubicaciones: t.ubicaciones,
        presupuestoDiarioMxn: config.presupuestoDiarioMxn,
        edadMin: t.edadMin,
        edadMax: t.edadMax,
      })
    );

    const imagenHash = await hashDeImagen(cacheHashes, cuentaId, t.imagen);

    const creativo = await api.crearCreativo(
      cuentaId,
      machote.payloadDeCreativo({
        nombre: t.creativo,
        copy: t.copy,
        imagenHash,
        sucursal: t.sucursal,
        whatsapp: config.whatsapp,
        mensajeInicial: t.mensajeInicial,
      })
    );

    const anuncio = await api.crearAnuncio(
      cuentaId,
      machote.payloadDeAnuncio({ nombre: t.creativo, conjuntoId: conjunto.id, creativoId: creativo.id })
    );

    creadas.push({ campana: t.campana, campanaId: campana.id, conjuntoId: conjunto.id, anuncioId: anuncio.id });
  }

  return creadas;
}

async function main() {
  const crearDeVerdad = process.argv.includes('--crear');
  const forzar = process.argv.includes('--forzar');

  const problemas = revisarConfig(CRENEF);
  if (problemas.length) {
    console.error(`\nFalta llenar ${problemas.length} dato(s) en src/ads/crenef.config.js:\n`);
    for (const p of problemas) console.error(`  · ${p}`);
    console.error('\nLlénalos y vuelve a correr el comando.\n');
    process.exitCode = 1;
    return;
  }

  const tareas = plan(CRENEF);
  mostrarPlan(CRENEF, tareas);

  const copysLimpios = mostrarRevisionDeCopys(tareas);

  if (!crearDeVerdad) {
    console.log('Esto fue solo una vista previa. Para crearlas en Meta:\n');
    console.log('  npm run ads:crenef -- --crear\n');
    return;
  }

  if (!copysLimpios && !forzar) {
    console.error('No creé nada: arregla los copys de arriba primero.');
    console.error('Si de plano quieres mandarlos así, corre el comando con --forzar.\n');
    process.exitCode = 1;
    return;
  }

  const creadas = await crearTodo(CRENEF, tareas);

  console.log(`\nListo: ${creadas.length} campaña(s) creadas EN PAUSA.\n`);
  for (const c of creadas) console.log(`  ${c.campana} → campaña ${c.campanaId}, anuncio ${c.anuncioId}`);
  console.log('\nRevísalas en el Administrador de anuncios y préndelas desde ahí.\n');
}

main().catch((error) => {
  console.error(`\n${error.message}\n`);
  process.exitCode = 1;
});
