# Análisis de talleres más vendidos y propuestas de calendario

Informe del 29 de agosto de 2026. Responde qué talleres se han vendido más en el
histórico de Endulcora, mes por mes, y propone dos calendarios para los próximos
doce meses: uno construido sobre las ventas propias y otro sobre los datos de Meta Ads.

**El informe se lee en `Endulcora-talleres-informe.pdf`** (24 páginas, A4) o en
`informe-talleres.html` (abrir en el navegador).
Publicado como artifact en https://claude.ai/code/artifact/717a3b19-fefa-4d0d-84f8-9c28b0aed5a2

## Fuentes

| Fuente | Dónde vive | Cobertura |
|---|---|---|
| REGISTRO PAGOS (respuestas) | Google Drive de endulcora@gmail.com | 2,297 pagos, abr 2024 – ene 2026 |
| Inscritos 2025 / Inscritos 2026 | Google Drive | feb–may 2025; enero y ago–sep 2026 |
| Meta Ads, cuenta 75151654 | Meta Business | gasto mensual desde mar 2025; detalle por anuncio sólo jun–ago 2026 |

Las ventas de talleres presenciales **no** están en el Postgres del sitio: la tabla
`orders` guarda productos digitales (eBooks, membresías). El registro real de
inscripciones vive en Drive.

## Qué hay en esta carpeta

- `informe-talleres.html` — el informe completo.
- `Endulcora-talleres-informe.pdf` — el informe listo para imprimir o compartir.
- `topdf.mjs` — regenera el PDF desde el HTML con Chromium (`node topdf.mjs`).
  El HTML trae su hoja de estilos de impresión, así que imprimir desde el navegador
  da el mismo resultado.
- `clasifica.py` — normaliza los 1,130 nombres libres de taller del formulario de
  pagos a un catálogo canónico mediante reglas ordenadas (la primera que hace match
  gana, así que el orden importa: "galletas tipo palacio" va antes que "galletas").
  Cobertura: 94.4% de los registros.
- `agregados/` — resultados agregados y anónimos, listos para reusar.

## Los datos crudos no están aquí, a propósito

`registro_pagos.csv` e `inscritos2025/2026` contienen nombres, correos, teléfonos,
domicilios, fechas de nacimiento y contactos de emergencia de los alumnos. **No se
suben al repositorio.** Todo lo que hay en `agregados/` son conteos y montos por
taller y por mes, sin ninguna referencia a personas.

Para reproducir el análisis: descargar `REGISTRO PAGOS (respuestas)` de Drive como
CSV a `registro_pagos.csv` y correr `python3 clasifica.py`.

## Archivos de `agregados/`

| Archivo | Contenido |
|---|---|
| `pagos_clasificados.json` | pares `[mes, taller]` de cada pago clasificado |
| `mensual_final.json` | por mes: años observados, total, promedio/año, índice de estacionalidad, top 8 talleres |
| `aforo.json` | por taller: sesiones, inscritos, aforo promedio, mejor sesión, sesiones vacías |
| `sesiones_raw.json` | las 257 sesiones con su año, mes, taller y conteo final |
| `por_taller2.json` | Meta jun–ago 2026 por taller: gasto, conversaciones, compras, impresiones |
| `cruce.json` | gasto de Meta contra inscritos reales: costo por inscrito y tasa de cierre |
| `registros2026.json` | inscritos confirmados por taller, agosto y septiembre 2026 |
| `gasto_meta.json` | gasto mensual de la cuenta de Meta |

## Advertencias sobre los números

1. **El mes es el del pago, no el del taller.** Coinciden salvo en la Rosca de Reyes,
   que se cobra en diciembre y se imparte los primeros días de enero.
2. **Febrero y marzo tienen un solo año observado** (2025). Sus barras van rayadas en
   las gráficas.
3. **Meta sólo explica jun–ago 2026 a nivel de taller.** Las campañas anteriores fueron
   eliminadas de la cuenta y la API ya no devuelve su desglose. De los $360,697 MXN
   gastados en 2026, sólo $92,049 tienen detalle recuperable.
4. **El aforo cubre nueve meses, no doce.** Hay conteo por sesión de enero a mayo y
   agosto de 2025, más enero y agosto–septiembre de 2026: 257 sesiones. Faltan junio,
   julio y septiembre a diciembre de 2025, que son los del segundo pico del año.
