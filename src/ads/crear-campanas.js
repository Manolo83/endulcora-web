#!/usr/bin/env node
// Crea en Meta Ads las campañas de Crenef siguiendo el machote de Endulcora.
//
//   npm run ads:crenef              enseña qué se va a crear, sin tocar Meta
//   npm run ads:crenef -- --crear   lo crea de verdad, todo EN PAUSA
//
// Nada se prende solo: campañas, conjuntos y anuncios nacen en PAUSED para que
// los revises en el Administrador de anuncios antes de gastar un peso.

const fs = require('fs');
const path = require('path');

const { CRENEF, revisarConfig } = require('./crenef.config');
const machote = require('./machote');
const api = require('./meta-api');

function plan(config) {
  const tareas = [];
  for (const taller of config.talleres) {
    for (const claveSede of taller.sedes) {
      const sede = config.sedes[claveSede];
      tareas.push({
        taller: taller.nombre,
        sede,
        inicio: taller.inicio,
        fin: taller.fin,
        imagen: taller.imagen,
        copy: taller.copy,
        ubicaciones: taller.ubicaciones || 'automaticas',
        campana: machote.nombreDeCampana({ taller: taller.nombre, sede: sede.nombre, inicio: taller.inicio }),
        creativo: machote.nombreDeCreativo({ taller: taller.nombre, sede, fin: taller.fin }),
      });
    }
  }
  return tareas;
}

function mostrarPlan(config, tareas) {
  const gastoDiario = tareas.length * (config.presupuestoDiarioMxn || machote.MACHOTE.presupuestoDiarioMxn);
  console.log(`\nPlan para ${config.marca} — ${tareas.length} campaña(s), $${gastoDiario} MXN al día en total:\n`);
  for (const t of tareas) {
    console.log(`  ${t.campana}`);
    console.log(`    conjunto  ${t.taller} · ${t.sede.nombre} · radio ${machote.MACHOTE.radioKm} km · ${t.ubicaciones}`);
    console.log(`    corre     ${t.inicio.slice(0, 16)} → ${t.fin.slice(0, 16)}`);
    console.log(`    anuncio   ${t.creativo} · imagen ${path.basename(t.imagen)}\n`);
  }
}

// Sube cada imagen una sola vez aunque la usen varios talleres.
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
      machote.payloadDeCampana({ taller: t.taller, sede: t.sede.nombre, inicio: t.inicio })
    );

    const conjunto = await api.crearConjunto(
      cuentaId,
      machote.payloadDeConjunto({
        campanaId: campana.id,
        taller: t.taller,
        sede: t.sede,
        inicio: t.inicio,
        fin: t.fin,
        ubicaciones: t.ubicaciones,
        presupuestoDiarioMxn: config.presupuestoDiarioMxn,
      })
    );

    const imagenHash = await hashDeImagen(cacheHashes, cuentaId, t.imagen);

    const creativo = await api.crearCreativo(
      cuentaId,
      machote.payloadDeCreativo({
        nombre: t.creativo,
        copy: t.copy,
        imagenHash,
        sede: t.sede,
        whatsapp: config.whatsapp,
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

  if (!crearDeVerdad) {
    console.log('Esto fue solo una vista previa. Para crearlas en Meta:\n');
    console.log('  npm run ads:crenef -- --crear\n');
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
