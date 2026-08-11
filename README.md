# Endulcora · Estudio Gastronómico

Sitio web de Endulcora con panel de administración propio: puedes publicar
anuncios y subir fotos/videos desde `/admin` y aparecen al instante en la
página pública, sin tocar código.

## Qué incluye

- **Sitio público** (`public/index.html`): la página original, con dos
  secciones nuevas y dinámicas — **Anuncios** y **Galería** — que se llenan
  solas leyendo datos del servidor.
- **Panel de administración** (`/admin`): protegido con contraseña. Permite:
  - Editar todo el contenido del inicio, la sección "Clase en vivo", el
    footer y el WhatsApp (**Contenido general**).
  - Agregar/editar/borrar **productos** de la tienda y **cursos**, con foto
    opcional.
  - Editar los **textos legales** del footer.
  - Ver las **ventas** hechas por Mercado Pago.
  - Publicar/ocultar/borrar anuncios y subir fotos/videos a la galería
    (hasta 150 MB), o pegar un enlace de YouTube/Vimeo.
- **Carrito y pagos**: los visitantes agregan productos/cursos a un carrito
  (guardado en su navegador) y pagan todo junto con **Mercado Pago**
  (tarjeta, OXXO, transferencia) vía Checkout Pro.
- **Bot de comentarios** en Facebook e Instagram (`/admin` → Bot de
  comentarios): contesta lo que preguntan en tus publicaciones con las fechas
  y precios reales, y manda a esa persona a tu WhatsApp. No vende, no aparta
  lugares y no cobra. Ver la sección 12.
- **Backend** en Node.js + Express (`server.js`, `src/`): sirve el sitio,
  guarda los datos en un archivo JSON y los archivos subidos en disco.
- **SEO básico**: `robots.txt`, `sitemap.xml`, metadatos Open Graph/Twitter,
  datos estructurados (JSON-LD) y URL canónica, para que Google pueda
  indexar `endulcora.com`.

No usa base de datos externa ni servicios de pago: todo vive en un volumen
de disco, así que no hay más cuentas que crear que GitHub y Railway.

## 1. Desarrollo local

```bash
npm install
cp .env.example .env   # edita ADMIN_PASSWORD y SESSION_SECRET
npm start
```

Abre `http://localhost:3000` para el sitio y `http://localhost:3000/admin`
para el panel (usa la contraseña que pusiste en `ADMIN_PASSWORD`).

## 2. Subir el proyecto a GitHub

El repositorio ya está conectado a `Manolo83/endulcora-web`. Si necesitas
volver a subir cambios manualmente:

```bash
git add -A
git commit -m "actualizo el sitio"
git push origin claude/endulcora-website-bns9po
```

## 3. Desplegar en Railway (hosting)

1. Entra a [railway.app](https://railway.app) e inicia sesión con tu cuenta
   de GitHub.
2. **New Project → Deploy from GitHub repo** y elige `Manolo83/endulcora-web`
   (rama `main`, o la rama que quieras dejar en producción).
3. Railway detecta que es un proyecto Node.js automáticamente (usa
   `npm install` y `npm start`). No necesitas Dockerfile.
4. **Agrega el plugin de PostgreSQL** (aquí se guardan productos, cursos,
   ventas, cuentas de clientes, suscriptores — todo el contenido dinámico):
   - En el proyecto, **New → Database → Add PostgreSQL**.
   - Railway crea la variable `DATABASE_URL` sola en el servicio; no hay
     que copiar ni pegar nada.
5. **Añade un Volume** (solo para las fotos/videos/PDFs que subas, no para
   los demás datos):
   - En el servicio, pestaña **Volumes → New Volume**.
   - Móntalo en la ruta `/data`.
6. **Variables de entorno** (pestaña **Variables**):
   | Variable | Valor |
   |---|---|
   | `ADMIN_PASSWORD` | una contraseña fuerte para entrar a `/admin` |
   | `SESSION_SECRET` | un texto largo y aleatorio (cualquier cadena de 32+ caracteres) |
   | `DATA_DIR` | `/data` |
   | `NODE_ENV` | `production` |
   | `SITE_URL` | `https://www.endulcora.com` |
   | `MP_ACCESS_TOKEN` | tu Access Token de Mercado Pago (ver sección 8) |
   | `MP_PUBLIC_KEY` | tu Public Key de Mercado Pago (ver sección 8) |

   `DATABASE_URL` y `PORT` los define Railway automáticamente, no hace
   falta agregarlos a mano.
7. Railway construye y despliega. Al terminar te da una URL tipo
   `endulcora-web-production.up.railway.app` — pruébala antes de conectar el
   dominio.

Cada vez que hagas `git push` a la rama conectada, Railway vuelve a
desplegar solo (CI/CD automático).

## 4. Conectar el dominio endulcora.com

**Si todavía no tienes el dominio**, cómpralo en un registrador (Namecheap,
GoDaddy, Google Domains/Squarespace, Cloudflare Registrar, etc.) — esto lo
tienes que hacer tú directamente, nadie más puede comprarlo por ti.

Con el dominio ya comprado:

1. En Railway, entra al servicio → **Settings → Networking → Custom Domain**.
2. Agrega `endulcora.com` y también `www.endulcora.com`.
3. Railway te da uno o dos registros DNS (normalmente un `CNAME` para `www`
   y un registro `A`/`ALIAS` o `CNAME` para el dominio raíz, según tu
   registrador).
4. Ve al panel de DNS de tu registrador y agrega esos registros exactamente
   como Railway los muestra.
5. Espera a que propague (minutos a un par de horas). Railway emite el
   certificado SSL automáticamente cuando detecta el DNS correcto — el
   candado del navegador aparece solo.

## 5. Que Google te encuentre al buscar "endulcora.com"

1. Entra a [Google Search Console](https://search.google.com/search-console)
   con tu cuenta de Google.
2. Agrega la propiedad `endulcora.com` (verificación por DNS: Google te da
   un registro TXT que agregas junto a los de Railway).
3. Una vez verificado, en **Sitemaps** envía: `https://endulcora.com/sitemap.xml`.
4. Usa **Inspección de URL** sobre `https://endulcora.com/` y pulsa
   **Solicitar indexación** para acelerar que aparezca en resultados.

Esto no es instantáneo (Google puede tardar días), pero con esto el sitio
queda correctamente preparado para ser indexado.

## 6. Usar el panel de administración

1. Ve a `https://endulcora.com/admin`.
2. Entra con la contraseña definida en `ADMIN_PASSWORD`.
3. **Anuncios**: escribe título y mensaje, decide si se publica de inmediato
   o se queda como borrador. Aparece al momento en la sección "Anuncios" del
   sitio.
4. **Galería**: sube una foto o video directamente (JPG, PNG, WEBP, GIF,
   MP4, WEBM, MOV — hasta 150 MB), o pega un enlace de YouTube/Vimeo si el
   video es muy pesado. Aparece al momento en la sección "Galería".
5. **Carrusel del inicio** (dentro de "Contenido general"): sube una o
   varias fotos de publicidad — aparecen dentro del marco junto al
   encabezado del sitio. Con 2 o más, rotan solas cada pocos segundos con
   puntos para navegar. Sin ninguna, se muestra la ilustración de la vela.
6. **Clientes**: si alguien te escribe por WhatsApp porque olvidó su
   contraseña, búscalo por su correo en esta pestaña y asígnale una nueva.
7. **Salir** cierra la sesión del panel.

No hace falta redeploy ni tocar código para publicar contenido nuevo — todo
pasa por el panel.

## 7. Seguridad y respaldos

- Cambia `ADMIN_PASSWORD` a algo fuerte y único; no lo compartas fuera del
  equipo de confianza. No hay registro público de usuarios: es una sola
  contraseña de administrador.
- El panel está bloqueado para buscadores (`robots.txt` y meta `noindex`) y
  tiene límite de intentos de inicio de sesión (20 cada 15 minutos) para
  frenar ataques de fuerza bruta.
- Todo el contenido dinámico (productos, cursos, ventas, cuentas de
  clientes, suscriptores, textos) vive en la base de datos PostgreSQL de
  Railway, no en el Volume — así sobrevive a cada despliegue. Solo las
  fotos/videos/PDFs que subes quedan en el Volume montado en `/data`.
  Railway no ofrece respaldo automático en la nube en el plan gratuito: de
  vez en cuando exporta la base de datos (`railway connect postgres` y
  `pg_dump`) o vuelve a subir tus fotos/videos importantes a otro lugar
  (Google Drive, etc.) como respaldo.

## 8. Pagos con Mercado Pago

El sitio usa **Checkout Pro** de Mercado Pago: el visitante arma su carrito,
pulsa "Ir a pagar" y se le redirige a la página de pago de Mercado Pago
(tarjeta, OXXO, transferencia). El sitio nunca ve ni guarda datos de
tarjetas.

1. Crea/entra a tu cuenta en [mercadopago.com.mx](https://www.mercadopago.com.mx)
   y vincula la cuenta bancaria (CLABE) donde quieres recibir el dinero.
2. Ve a [mercadopago.com.mx/developers/panel](https://www.mercadopago.com.mx/developers/panel)
   y crea una aplicación de tipo **Checkout Pro**.
3. En **Credenciales de prueba**, copia el **Access Token** y el **Public
   Key** y ponlos en Railway como `MP_ACCESS_TOKEN` y `MP_PUBLIC_KEY` — así
   puedes probar compras completas sin usar dinero real.
4. Cuando quieras cobrar de verdad, repite el paso con la pestaña
   **Credenciales de producción** y reemplaza esas mismas dos variables en
   Railway.
5. En el panel `/admin` → **Ventas** puedes ver cada pedido y su estado
   (pendiente/aprobado/rechazado).

## 9. Entrega automática de compras

Cuando un pedido de un eBook, anexo o recetario queda "Aprobado", el sitio le
manda automáticamente un correo al comprador con un botón para descargar su
archivo. Los cursos no llevan archivo — el correo le avisa que le confirmarás
por WhatsApp.

Para que esto funcione necesitas dos cosas:

1. **Sube el archivo de cada producto**: en `/admin` → **Productos**, al
   editar cualquiera verás el campo "Archivo que se entrega al comprarlo"
   (PDF, Excel o ZIP, hasta 80 MB). Sin este archivo, el correo le dice al
   cliente que se lo enviarás pronto, y tú sigues entregándolo manual desde
   **Ventas** como antes.
2. **Configura el envío de correos** (mismo servicio que usamos para
   "olvidé mi contraseña" en su momento, ahora reactivado):
   - Crea una cuenta gratis en [resend.com](https://resend.com).
   - En su panel, ve a **API Keys → Create API Key**, dale un nombre y
     cópiala en cuanto aparezca.
   - En Railway, agrega la variable `RESEND_API_KEY` con esa clave.
   - Deja `RESEND_FROM` como `Endulcora <onboarding@resend.dev>` para
     empezar a probar de inmediato. Cuando quieras que los correos salgan
     como `noreply@endulcora.com`, en Resend ve a **Domains → Add Domain**,
     agrega `endulcora.com` y sigue sus instrucciones para añadir los
     registros DNS en Squarespace — igual que hicimos con el dominio del
     sitio. Luego cambia `RESEND_FROM` a `Endulcora <noreply@endulcora.com>`.

Si `RESEND_API_KEY` no está configurada, todo sigue funcionando normal; el
pedido se aprueba igual, solo que el correo automático no se envía y tienes
que entregar manualmente desde **Ventas**, como siempre.

## 10. Cuentas de clientes

Los visitantes pueden crear una cuenta (correo, contraseña y nombre) desde
"Acceso clientes". Con su cuenta pueden ver el historial de sus pedidos
(vinculados automáticamente cuando compran habiendo iniciado sesión, o por
correo si compraron sin sesión) y cambiar su nombre o contraseña.

Si un cliente olvida su contraseña, el botón "¿Olvidaste tu contraseña?" lo
manda directo a tu WhatsApp para que le ayudes manualmente — el sitio no
envía correos de recuperación automáticos.

## 11. Asistente de IA (burbuja de chat)

El sitio tiene una burbuja de chat flotante (esquina inferior derecha) que
responde preguntas sobre productos, cursos y la calculadora de costeo,
usando la API gratuita de Google Gemini.

1. Entra a [aistudio.google.com](https://aistudio.google.com) e inicia
   sesión con tu cuenta de Google.
2. Busca **Get API key → Create API key**. No pide tarjeta para el nivel
   gratuito.
3. En Railway, agrega la variable `GEMINI_API_KEY` con esa clave.

Nota: la suscripción de "Gemini Pro"/"Gemini Advanced" (la app de chat) es
un producto distinto y **no** sirve como esta clave — la clave se saca
siempre desde aistudio.google.com.

Si `GEMINI_API_KEY` no está configurada, la burbuja del asistente sigue
apareciendo, pero responde que todavía no está activado.

## 12. Bot de comentarios en Facebook e Instagram

Contesta los comentarios que la gente deja en tus publicaciones y la manda a
tu WhatsApp de siempre, donde la atiende una persona.

### Qué hace

1. Le llega el comentario por el webhook de Meta.
2. Lee la duda y busca la respuesta en los talleres que tienes cargados: qué
   incluye, cuánto cuesta, qué fechas hay. **Nunca anuncia una fecha ya pasada
   ni un taller agotado**, porque las fechas salen de tu calendario.
3. Deja una **respuesta pública** debajo del comentario, corta y amable,
   firmada como Endulcorito.
4. Manda un **mensaje privado** a esa persona con la respuesta a su duda y la
   liga a tu WhatsApp.

Y ahí termina. No vende, no aparta lugares, no cobra y no pide datos. Todo
eso lo sigues haciendo tú por WhatsApp, igual que hoy.

> Meta permite **un solo mensaje privado por comentario**. Por eso ese mensaje
> lleva siempre la liga de WhatsApp, incluso si el modelo no logró contestar:
> es la única oportunidad de mandar a esa persona contigo.

### Qué NO hace

**No toca los mensajes directos.** Los DM de Messenger e Instagram siguen
llegando a tu bandeja de Meta y los contestas tú, como siempre. El bot ni los
guarda ni los responde.

**No atiende WhatsApp.** Tu número se queda en la app de WhatsApp Business de
tu celular, sin tocarlo. El bot solo reparte gente hacia allá.

### Qué hace siempre, sin excepción

- Respeta **BAJA**: a quien pidió no recibir mensajes no le escribe, ni
  siquiera por un comentario suyo.
- No contesta sus propios comentarios (por eso hay que configurar
  `META_PAGE_ID` y `META_IG_ID`), así no se queda en un bucle.
- Nunca inventa precios, fechas, cupos ni promociones. Si no lo tiene
  cargado, no lo dice.
- Nunca pide datos de tarjeta, CVV, NIP ni identificaciones.
- No negocia precio.
- Si Meta reintenta el mismo comentario, no lo contesta dos veces.

Te avisa por correo (el que configures en el panel) cuando canaliza a alguien:
quejas, facturación, alergias, colaboraciones o algo que no supo contestar.
El correo lleva la conversación completa.

### Configurar Meta (una sola vez)

1. En [developers.facebook.com](https://developers.facebook.com) crea una app
   de tipo **Negocios** y agrégale los productos **Messenger** e
   **Instagram**.
2. En **Configuración de la app → Básica**, copia la *Clave secreta de la app*
   a la variable `META_APP_SECRET` de Railway.
3. Inventa un texto cualquiera y ponlo en `META_VERIFY_TOKEN`.
4. En **Webhooks**, da de alta la URL `https://www.endulcora.com/api/meta/webhook`
   con ese mismo token, y suscríbete a los campos **`feed`** (comentarios de
   Facebook) y **`comments`** (comentarios de Instagram).
5. Copia el token de la página a `META_PAGE_TOKEN`, y los identificadores a
   `META_PAGE_ID` y `META_IG_ID`.
6. Pasa la app a modo **Activo**. En modo Desarrollo, Meta solo entrega
   webhooks de prueba: no llega ni un comentario real.
7. No necesitas ninguna clave nueva de inteligencia artificial: el bot usa la
   misma `GEMINI_API_KEY` que ya mueve al asistente del sitio.

> Si la clave secreta no coincide, el servidor rechaza todo lo que manda Meta.
> Desde el panel de Meta se ve entregado y en `/admin` no aparece nada. El log
> lo dice con todas sus letras: busca `[bot] Webhook rechazado` en Railway.

### Configurar el bot (en `/admin` → Bot de comentarios)

- **Enciéndelo.** Llega apagado: mientras esté apagado no contesta nada.
- **El diagnóstico** de arriba te dice qué llave falta en el servidor (nunca
  su valor), si el bot está encendido, cuántos talleres tiene y cuándo fue la
  última vez que Meta le entregó algo.
- **WhatsApp de atención personal.** Tu número de siempre, con lada del país
  (52). Es a donde manda a toda la gente.
- **Los mensajes del bot.** Tres textos: la respuesta pública, el saludo del
  privado y su cierre. Se mandan tal cual los escribas; el bot solo redacta la
  respuesta a la duda, que va en medio.
- **Los talleres.** Hay un botón que carga de golpe los 17 talleres con sus
  copys y sus 37 fechas. Se puede repetir sin miedo: solo agrega lo que falte,
  nunca pisa lo que ya editaste. Para uno nuevo, ponle su palabra clave, su
  precio y escribe `{{FECHAS}}` en el copy donde van las fechas.
- **El aviso interno de cada taller.** Es una nota que el bot obedece pero
  nunca repite: "solo mayores de 18", "no prometas control de glucosa", etc.
- **Liga las fechas.** En *Calendario*, cada día tiene un selector **Taller
  del bot**, un **horario** y un **cupo**. Las fechas que ligues ahí son las
  que anuncia el bot. Si no ligas ninguna, dice que no hay fechas abiertas en
  vez de inventarlas.

### Costo

El bot corre sobre el mismo modelo de Gemini que el asistente del sitio y con
la misma clave, así que no agrega ninguna cuenta ni ningún cobro nuevo.

Alcanza porque el trabajo del modelo aquí es chico: un comentario, una
respuesta corta. El saludo, el cierre y la liga los pone el código.

Ten en cuenta que el nivel gratuito de Google tiene límites de peticiones por
minuto y que Google puede usar esas conversaciones para mejorar sus modelos.
Como por aquí pasan nombres de clientes, conviene saberlo; el nivel de pago de
Google no usa los datos así.

## 13. Notas técnicas y mejoras futuras (opcionales)

- El sitio usa Tailwind CSS por CDN para mantener el HTML original tal cual
  — funciona perfecto para el tráfico de un sitio personal/pequeño negocio.
  Si el tráfico crece mucho, se puede migrar a un build de Tailwind
  compilado para mejorar el tiempo de carga.
- Los datos se guardan en un archivo JSON simple (sin base de datos), lo
  cual es suficiente para el volumen de contenido de este sitio (anuncios y
  galería). Si en el futuro se necesita más escala (por ejemplo, cientos de
  archivos o múltiples administradores), se puede migrar a PostgreSQL
  (Railway lo ofrece como plugin con un clic) sin cambiar el resto del
  sitio.
