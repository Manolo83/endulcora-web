# LIVES gratis · semana 13–15 octubre 2026

Campaña Meta `52515356214591` · pixel `1302735011542499` · evento `COMPLETE_REGISTRATION`
Landing: https://www.endulcora.com/endulcora-en-vivo

## Calendario y links de transmisión

Fechas y horas tomadas del arte renderizado (fuente de verdad).

| Live | Fecha y hora CDMX | Link YouTube | ID para `clase_youtube_id` | Creative | Ad CDMX |
|---|---|---|---|---|---|
| Pizza casera | martes 13 oct · 4:00 PM | https://www.youtube.com/watch?v=32-QxPUqUA4 | `32-QxPUqUA4` | 1119956787241867 | 52515358065591 |
| Arroz poblano | miércoles 14 oct · 5:00 PM | https://www.youtube.com/live/F7hh25_Cg3M | `F7hh25_Cg3M` | 1659464832207681 | 52515358084991 |
| Brownies | jueves 15 oct · 7:00 PM | https://www.youtube.com/live/8JAH9TGknTc | `8JAH9TGknTc` | 1449534813770682 | 52515358089591 |

Ads del conjunto "Habla hispana" (en pausa hasta validar CDMX):
Pizza 52515358091991 · Arroz 52515358101391 · Brownies 52515358124391

## Qué hay que actualizar en el admin antes de cada live

Campo `clase_youtube_id` = el ID de la tabla (solo el ID, no la URL completa).
Si ese campo y `clase_url` quedan vacíos, la página NO muestra el formulario de
registro: el visitante ve un placeholder y el anuncio tira dinero.

`clase_cobro_activo` tiene que quedar en `false` para que el registro gratis
funcione; si está en `true`, el POST /api/clase-en-vivo/registro responde 400.

## Pendiente que bloquea la medición

`public/endulcora-en-vivo.html` (rama claude/endulcora-website-bns9po) tiene el
pixel pero solo dispara PageView. Falta disparar `CompleteRegistration` al
completar el registro, como ya lo hace `public/clase-gratis.html`. Sin eso Meta
optimiza a ciegas y reporta cero registros.
