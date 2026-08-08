# Marca · Endulcora

Materiales de identidad visual del estudio gastronómico.

## Archivos

- **`guia-de-marca.html`** — Guía de marca completa: concepto, logotipo, paleta con
  matriz de contraste WCAG, tipografía, componentes y voz. Ábrela en el navegador.
- **`banners.html`** — Kit de plantillas de banner on-brand en tamaños reales de red
  social. Edita los textos y exporta cada banner (o haz captura 1:1).
- **`banners/`** — PNG ya generados, listos para publicar:
  | Archivo | Tamaño | Uso |
  |---|---|---|
  | `post-clase-en-vivo.png` | 1080×1080 | Post IG/FB — clase en vivo |
  | `story-proximo-taller.png` | 1080×1920 | Story IG/FB — próximo taller |
  | `post-ebook-anexo.png` | 1080×1080 | Post IG/FB — lanzamiento de eBook |
  | `banner-anuncio-1200x628.png` | 1200×628 | Banner ancho / Open Graph |

## Regenerar los PNG

Los banners se exportan con el Chromium preinstalado usando `playwright-core`
(instálalo solo cuando lo necesites, sin descargar el browser):

```bash
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i -D playwright-core
```

Luego, un script que abra `banners.html`, espere a `document.fonts.ready` y haga
`element.screenshot()` de cada banner por su `id` (`post-clase`, `story-taller`,
`post-ebook`, `wide-anuncio`) apuntando `executablePath` a
`/opt/pw-browsers/chromium-*/chrome-linux/chrome`.

## Reglas rápidas de marca

- El ámbar **flama** (`#F5A623`) solo como texto sobre fondos oscuros (vino/carbón).
  Sobre crema/blanco falla el contraste — usa vino o morado.
- Proporción 60 % crema · 30 % vino/carbón · 10 % flama.
- Fuentes: Baloo 2 (títulos), Great Vibes (firma), Montserrat (interfaz), Poppins (cuerpo).
