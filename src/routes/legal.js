// Paginas legales con direccion propia. El sitio ya mostraba estos textos en
// modales, pero un modal no tiene URL: Meta (y cualquier tienda de apps) pide
// una liga que cargue sola la politica de privacidad para dejar publicar la
// app. Los textos son los mismos que se editan en /admin, no una copia.
const express = require('express');
const store = require('../store');

const router = express.Router();

const PAGINAS = {
  privacidad: { clave: 'legal_privacidad', titulo: 'Aviso de privacidad' },
  terminos: { clave: 'legal_terminos', titulo: 'Términos y condiciones' },
  reembolso: { clave: 'legal_reembolso', titulo: 'Política de reembolso' },
  licencia: { clave: 'legal_licencia', titulo: 'Licencia de uso' },
  inocuidad: { clave: 'legal_inocuidad', titulo: 'Aviso de inocuidad' },
};

function escapar(texto) {
  return String(texto == null ? '' : texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// El primer renglon de cada bloque suele ser un titulillo corto que termina en
// punto ("Que recabamos.", "Tus derechos ARCO."). Lo resaltamos para que el
// texto se lea como documento y no como un muro.
function parrafo(bloque) {
  const limpio = escapar(bloque.trim()).replace(/\n/g, '<br>');
  const encabezado = limpio.match(/^([^.<]{3,40}\.)(\s|&nbsp;)/);
  if (encabezado) {
    return `<p><strong>${encabezado[1]}</strong>${limpio.slice(encabezado[1].length)}</p>`;
  }
  return `<p>${limpio}</p>`;
}

function pagina({ titulo, cuerpo, actualizado }) {
  const otras = Object.entries(PAGINAS)
    .map(([ruta, def]) =>
      def.titulo === titulo
        ? `<span aria-current="page">${escapar(def.titulo)}</span>`
        : `<a href="/${ruta}">${escapar(def.titulo)}</a>`
    )
    .join('');

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapar(titulo)} · Endulcora</title>
<meta name="description" content="${escapar(titulo)} de Endulcora · Estudio Gastronómico, Ciudad de México.">
<link rel="icon" href="/favicon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Poppins:wght@300;400;600&display=swap" rel="stylesheet">
<style>
  :root { --carbon:#1B0720; --vino:#4E1454; --flama:#F5A623; --crema:#FBF4E9; }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--crema); color: var(--carbon);
    font-family: 'Poppins', system-ui, -apple-system, sans-serif;
    font-weight: 300; line-height: 1.75; -webkit-font-smoothing: antialiased;
  }
  header { background: var(--vino); color: var(--crema); padding: 2.25rem 1.5rem 2.75rem; }
  .caja { max-width: 46rem; margin: 0 auto; }
  header a.marca {
    color: var(--crema); text-decoration: none; font-family: 'Bebas Neue', sans-serif;
    font-size: 1.6rem; letter-spacing: .18em;
  }
  header a.marca span { color: var(--flama); }
  h1 {
    font-family: 'Bebas Neue', sans-serif; font-weight: 400; letter-spacing: .04em;
    font-size: clamp(2rem, 7vw, 3rem); margin: 1.75rem 0 .5rem; line-height: 1.05;
  }
  header p.sello { margin: 0; font-size: .78rem; letter-spacing: .18em; text-transform: uppercase; opacity: .7; }
  main { max-width: 46rem; margin: 0 auto; padding: 2.5rem 1.5rem 1rem; }
  main p { margin: 0 0 1.35rem; font-size: 1rem; }
  main strong { font-weight: 600; color: var(--vino); }
  .fecha { margin-top: 2.5rem; font-size: .82rem; opacity: .6; }
  nav.otras {
    max-width: 46rem; margin: 0 auto; padding: 1.5rem 1.5rem 3rem;
    border-top: 1px solid rgba(78,20,84,.15); display: flex; flex-wrap: wrap; gap: .5rem 1.25rem;
    font-size: .82rem;
  }
  nav.otras a { color: var(--vino); text-decoration: none; border-bottom: 1px solid transparent; }
  nav.otras a:hover { border-bottom-color: var(--flama); }
  nav.otras span { opacity: .45; }
  footer { background: var(--carbon); color: rgba(251,244,233,.6); font-size: .8rem; padding: 1.75rem 1.5rem; }
  footer a { color: var(--flama); text-decoration: none; }
</style>
</head>
<body>
<header>
  <div class="caja">
    <a class="marca" href="/">ENDULCORA<span>.</span></a>
    <h1>${escapar(titulo)}</h1>
    <p class="sello">Endulcora · Estudio Gastronómico · Ciudad de México</p>
  </div>
</header>
<main>
  ${cuerpo}
  <p class="fecha">Última actualización: ${escapar(actualizado)}.</p>
</main>
<nav class="otras">${otras}</nav>
<footer>
  <div class="caja">
    ¿Dudas sobre este documento? Escríbenos a
    <a href="mailto:endulcora@gmail.com">endulcora@gmail.com</a>. ·
    <a href="/">Volver al sitio</a>
  </div>
</footer>
</body>
</html>`;
}

Object.entries(PAGINAS).forEach(([ruta, def]) => {
  router.get(`/${ruta}`, (req, res) => {
    const contenido = store.getContent();
    const texto = contenido[def.clave] || '';
    const cuerpo = texto
      .split(/\n{2,}/)
      .map((b) => b.trim())
      .filter(Boolean)
      .map(parrafo)
      .join('\n  ');

    const actualizado = new Date().toLocaleDateString('es-MX', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'America/Mexico_City',
    });

    res.type('html').send(
      pagina({
        titulo: def.titulo,
        cuerpo: cuerpo || '<p>Este documento se está actualizando. Escríbenos a endulcora@gmail.com y te lo enviamos.</p>',
        actualizado,
      })
    );
  });
});

module.exports = router;
