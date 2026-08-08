# Revisión de seguridad — Endulcora (agosto 2026)

Auditoría de solo lectura del backend (`server.js`, `src/`). Alcance: autenticación
del panel admin, sesiones, subida de archivos, checkout y webhook de Mercado Pago,
y la capa de datos (`store.js`).

**Veredicto general:** base sólida. Los precios se resuelven en el servidor (no se
confía en el cliente), hay rate-limiting en login y checkout, los tipos MIME de
subida están en lista blanca, el contenido público se escapa al renderizar y el
store escribe de forma atómica. Los puntos abajo son de endurecimiento; solo el
primero es crítico y depende de la configuración del despliegue.

| # | Severidad | Tema | Estado |
|---|-----------|------|--------|
| 1 | 🔴 Alta (según config) | `SESSION_SECRET` con valor por defecto público | ✅ Corregido |
| 2 | 🟠 Media | Webhook de Mercado Pago sin verificar firma | 📋 Recomendado |
| 3 | 🟠 Media/Baja | Extensión de archivo subido tomada del nombre del cliente | ✅ Corregido |
| 4 | 🟡 Baja | `src` de media sin escapar en el render (XSS post-admin) | ✅ Corregido |
| 5 | 🟡 Baja | CSP deshabilitada | 📋 Recomendado |
| 6 | 🟡 Baja | Merge con `Object.assign` (prototype pollution post-admin) | 📋 Recomendado |
| 7 | ⚪ Info | Login en texto plano vs. hash bcrypt | 📋 Recomendado |

---

## 1. 🔴 `SESSION_SECRET` con valor por defecto público — CORREGIDO

**Antes** (`server.js`): si la variable `SESSION_SECRET` no estaba definida, la cookie
de sesión se firmaba con la cadena literal `'cambia-esta-clave-en-las-variables-de-entorno'`,
**visible en el repositorio**. Cualquiera que la conociera podía **forjar una cookie de
sesión con `isAdmin: true`** y obtener control total del panel: publicar/borrar anuncios y
contenido, subir archivos y **leer todos los pedidos con los correos de los clientes**.

**Corrección aplicada:** si `SESSION_SECRET` no está definida, en **producción** el arranque
falla con un mensaje claro (mejor caer que quedar vulnerable); fuera de producción se genera
un secreto aleatorio por arranque y se avisa por consola. Nunca se usa la constante pública.

**Acción para ti:** define `SESSION_SECRET` en el entorno de Railway con un valor **largo y
aleatorio**. Genera uno con:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## 2. 🟠 Webhook de Mercado Pago sin verificar firma — RECOMENDADO

`POST /api/checkout/webhook` acepta cualquier petición. El riesgo real está **acotado**
porque el estado del pago se vuelve a consultar a la API de Mercado Pago por `id` (fuente
autoritativa), así que no se puede marcar un pedido como "aprobado" sin un pago real. Aun así:
- Un atacante anónimo puede disparar llamadas salientes a la API de MP con IDs arbitrarios.
- Si en el futuro se añade lógica de entrega/correo en el webhook, se vuelve explotable.

**Recomendación:** validar la cabecera `x-signature` (HMAC con tu *webhook secret*) según la
[documentación de MP](https://www.mercadopago.com.mx/developers/es/docs/your-integrations/notifications/webhooks).
Requiere añadir `MP_WEBHOOK_SECRET` al entorno. Puedo implementarlo si me confirmas.

## 3. 🟠 Extensión de archivo desde el nombre del cliente — CORREGIDO

**Antes** (`src/routes/admin.js`): el nombre del archivo guardado usaba la extensión del
`originalname` del cliente. Aunque el MIME está en lista blanca, un admin podía subir un
archivo con `Content-Type: image/png` pero nombre `x.html`, guardado como `<uuid>.html` y
servido por `/uploads` en el mismo dominio → **HTML/XSS alojado en el dominio de pagos**.
Requiere sesión admin, por eso no es crítico.

**Corrección aplicada:** la extensión ahora se deriva del **MIME validado** (mapa
mime→extensión), ignorando el nombre del cliente.

## 4. 🟡 `src` de media sin escapar — CORREGIDO

**Antes** (`public/index.html`): las tarjetas de galería insertaban `src="${m.url}"` sin
escapar en `<img>`, `<iframe>` y `<video>`. Un admin podía guardar una URL con comillas y
romper el atributo → **XSS almacenado** (post-admin).

**Corrección aplicada:** las URLs de media se escapan con `escapeHtml` antes de insertarse en
el atributo, igual que ya se hacía con el título.

## 5. 🟡 CSP deshabilitada — RECOMENDADO

`helmet({ contentSecurityPolicy: false })` desactiva la Content-Security-Policy porque el sitio
carga Tailwind por CDN y usa scripts inline. Se pierde una capa fuerte anti-XSS. El render
público ya escapa el contenido, así que es defensa en profundidad.

**Recomendación (a futuro):** autoalojar Tailwind (paso de build) y mover los scripts inline a
archivos, para poder activar una CSP estricta. Encaja con el trabajo de rendimiento/SEO.

## 6. 🟡 Merge con `Object.assign` — RECOMENDADO

`updateProduct`, `updateCurso` y `updateOrder` hacen `Object.assign(item, patch)` con el cuerpo
enviado por el admin. Una clave `__proto__` en el JSON podría contaminar `Object.prototype`
(*prototype pollution*), post-admin. `updateContent` ya es seguro (solo asigna claves existentes
y de tipo string).

**Recomendación:** rechazar las claves `__proto__`, `constructor` y `prototype` en los patches,
o usar una función de merge segura.

## 7. ⚪ Login en texto plano — RECOMENDADO

`auth.js` compara `password === ADMIN_PASSWORD` cuando no hay hash. Funciona, pero en producción
conviene usar **`ADMIN_PASSWORD_HASH`** (bcrypt), como ya contempla `.env.example`. Genera el hash con:
```bash
node -e "console.log(require('bcryptjs').hashSync('tu-clave-fuerte', 10))"
```

---

## Lo que ya está bien
- Precios recalculados en el servidor desde el store (no se confía en el cliente).
- Rate-limiting en `/admin/login` (20/15 min) y `/api/checkout/preference` (30/10 min).
- Lista blanca de MIME y límites de tamaño en subidas (imágenes 20 MB, media 150 MB).
- Escape de HTML del contenido dinámico en el render público.
- Cookies de sesión `httpOnly` (por defecto), `sameSite: lax`, `secure` en producción → mitiga CSRF.
- Escritura atómica del `db.json` (archivo temporal + rename).
- `data/` (con `db.json` y subidas) está fuera de git y no se sirve salvo `/uploads`.
