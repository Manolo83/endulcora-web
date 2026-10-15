# Checklist obligatorio — cuenta 75151654

Esto existe porque entre sesiones NO conservo esta cuenta en memoria. La
reconstruyo desde un resumen, y un dato mal escrito se propaga sin que yo
lo note. Este archivo es la memoria que el resumen no garantiza.

## Antes de escribir cualquier copy

1. Renderizar el arte (`ads_get_ad_preview`). Si no hay creative, crear uno
   temporal solo para verlo.
2. Leer del arte: fecha(s), hora, sede, numero de recetas/versiones, precio,
   anticipo, palabra clave de WhatsApp.
3. Mis notas NO son fuente. La fuente es el arte renderizado y la palabra de
   Manolo. Si no coinciden, gana Manolo.

## Antes de activar un contenedor reusado

4. Listar TODOS los anuncios del conjunto con el campo `status`
   (no `effective_status`).
5. Confirmar que cada anuncio viejo dice `status: PAUSED`.
   `ADSET_PAUSED` NO basta: ese anuncio se enciende solo al activar el
   conjunto.
6. Renombrar el conjunto antes de activarlo, para que el nombre no mienta.

## Despues de CUALQUIER cambio

7. Leer el estado de vuelta. Siempre. El `success: true` de la herramienta
   dice que el mensaje se envio, no que el estado quedo como yo creo.
8. Para pausas: pausar el CONJUNTO no pausa sus anuncios. Son dos llamadas.

## Antes de reportarle a Manolo

9. Los numeros de entrega se leen a nivel ANUNCIO, no a nivel conjunto.
   Un conjunto puede estar gastando en el arte equivocado.
10. Un registro no es una venta. Una conversacion no es una inscripcion.
    El numero que importa es el registro en la hoja de Leslie.
11. Si una afirmacion mia de ayer resulto falsa, corregirla explicitamente
    antes de dar datos nuevos.

## Barrido semanal

12. Listar todos los anuncios con `effective_status` en
    [ACTIVE, ADSET_PAUSED] y pausar los que tengan `status: ACTIVE`
    dentro de conjuntos apagados. Son minas esperando.
