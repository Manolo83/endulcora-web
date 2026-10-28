# Promociones reutilizables (pendiente)

Estado: **en pausa, sin publicar**. Decidido con la dueña el 28/10/2026: se
implementa cuando haga falta lanzar otra promoción después del Buen Fin.
El avance está en la rama `claude/promo-reutilizable` (sin probar ni
publicar). La rama principal sigue con la promoción fija "Buen Fin".

## Qué se quiere

Usar la misma página, el mismo correo, los mismos recordatorios y la misma
mecánica (1 eBook a un precio, 4 eBooks a otro) para cualquier temporada:
Hot Sale, Fin de año, Día de las Madres, etc., sin tocar código.

## Decisiones de la dueña

1. **Dirección según el nombre.** La promoción actual vive en `/buen-fin`;
   la siguiente en `/hot-sale`, etc. (se arma sola a partir del nombre).
   Los links de promociones anteriores (ej. `/buen-fin`) redirigen a la
   promoción del momento, conservando `?origen=correo&eb=...`.
2. **Imagen para WhatsApp (og:image) la genera el sitio**, con el mismo
   diseño de `public/og-buen-fin.png` y el título y precios nuevos. El Buen
   Fin conserva su imagen actual.
3. **El correo de lanzamiento se manda a todos los que interactuaron** en
   endulcora.com (mismo filtro de hoy). La opción "solo a quienes no lo han
   recibido" existe pero **no viene marcada**.

## Diseño

Vista previa aprobada en concepto: https://claude.ai/artifact/X5ZcAoJPGfEACwSngGZgwD

### Admin (tarjeta "Promoción")
- Campos nuevos: **Nombre de la promoción** (`promo_nombre`, por defecto
  "Buen Fin") y **Título grande** (`promo_titulo`, vacío = "¡Llegó el
  <nombre> a Endulcora!"; para Buen Fin: "¡El Buen Fin llegó antes a
  Endulcora!").
- Al cambiar el nombre empieza una promoción nueva: la anterior se guarda en
  `promo_historial` (JSON: slug, nombre, inicio, fin) y se muestra como
  "Promociones anteriores". Sus conteos (ventas, envíos, recordatorios)
  quedan como historial y los de la nueva arrancan en cero.
- Correo a la comunidad: dos opciones antes del botón, "A todos" (marcada) y
  "Solo a quienes no lo han recibido" (de esta promoción).

### Dónde cambia el nombre
- Asunto del lanzamiento: `LLEGÓ EL <NOMBRE> A ENDULCORA 🎉 Tus eBooks desde $50`.
- Recordatorios: `⏰ QUEDAN 3 DÍAS DEL <NOMBRE> EN ENDULCORA` y
  `⏰ ÚLTIMO DÍA: el <nombre> de Endulcora termina hoy`.
- Pagos a medias: `Tus eBooks del <nombre> te esperan 🛒`.
- Cuerpo de los correos, mensaje de WhatsApp del admin, página (título,
  pestaña, og:title, og:url, "El <nombre> ya terminó"), títulos de los
  artículos en Mercado Pago y `back_url` de error.
- "A mitad de precio" solo si el descuento es 50%; si no, "con X% de descuento".

## Implementación (lo que ya está en la rama)

- `src/promoBuenFin.js`: `configPromo()` regresa `nombre`, `titulo`, `slug`;
  `slugPromo()` (con direcciones reservadas del sitio para no chocar con
  /membresia, /blog, etc.), `historialPromos()`, `esCampanaDeLaPromo()`.
  Los pedidos guardan `promo = slug` (los del Buen Fin ya tienen
  `'buen-fin'`, no requieren migración). Las campañas guardan `promoSlug`
  (las anteriores sin ese campo cuentan como Buen Fin).
- `src/imagenPromo.js` + `assets/fuentes/` (Baloo 2, Bebas Neue,
  Montserrat): genera el PNG 1200×630 con `@napi-rs/canvas`; ruta
  `/og-promo.png?v=<hash>`.
- `src/paginas/promo.html` (antes `public/buen-fin.html`) con marcadores
  `{{TITULO}}`, `{{NOMBRE}}`, `{{UNO}}`, `{{PAQUETE}}`, `{{DESDE}}`, `{{URL}}`,
  `{{OG}}`; `server.js` la sirve en `/:promoSlug` y redirige las anteriores.
- `src/email.js` (`htmlCorreoBuenFin` recibe `nombrePromo`, `tituloPromo`,
  `slugPromo`), `src/recordatoriosBuenFin.js` (asuntos con el nombre),
  `src/routes/checkout.js`, `src/routes/admin.js` (`soloNuevos`, historial
  al cambiar `promo_nombre` en `PATCH /api/content`), `src/store.js`
  (defaults `promo_nombre`, `promo_titulo`, `promo_historial`).

## Lo que falta

1. Admin (`public/admin/index.html`): campos Nombre y Título, opciones "A
   todos / Solo nuevos" (enviar `soloNuevos` al endpoint), historial, título
   de la tarjeta "Promoción", y el mensaje de WhatsApp con el título/link
   nuevos (`r.titulo`, `r.link`).
2. Pruebas: correr todas las de la promoción (Buen Fin, correo,
   recordatorios, revisión de pagos, entregas) más nuevas para: cambio de
   nombre → nueva dirección, redirección con query, historial, conteos en
   cero, imagen generada, asuntos con el nombre, `soloNuevos`.
3. Capturas reales de la página, los correos y el admin; aprobación de la
   dueña; merge.
4. Antes de retomar, traer los cambios de la rama principal a esta rama
   (puede haber conflictos en `email.js`, `admin.js` y `server.js`).
