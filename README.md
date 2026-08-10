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
- **Bot de ventas** en WhatsApp, Messenger e Instagram (`/admin` → Bot de
  ventas): manda la información del taller con las fechas reales, la promo y
  las instrucciones de pago, y te avisa por correo cuando toca que sigas tú.
  No cobra ni confirma lugares. Ver la sección 12.
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

## 12. Bot de ventas en WhatsApp, Messenger e Instagram

Atiende los tres canales de Meta Business y lleva a quien pide informes por
el mismo embudo que usas hoy a mano.

### Hasta dónde llega

1. Detecta de qué taller preguntan (por la palabra clave o porque el cliente
   lo dice).
2. Manda el copy del taller, **con las fechas de tu calendario inyectadas**.
   Nunca anuncia una fecha ya pasada ni un taller agotado.
3. Manda el gancho del regalo y espera la confirmación de lectura.
4. Manda la promo con el precio exclusivo.
5. Pregunta para cuántas personas y manda el aviso urgente con el anticipo
   **multiplicado por persona** y la hora límite calculada. La promo dura 24
   horas **contadas desde el primer mensaje del cliente**, no desde que el bot
   manda el aviso; si alguien vuelve después de ese plazo, el bot no se la
   extiende: canaliza para que una persona decida.
6. Si el cliente acepta, manda las instrucciones de pago y **ahí se detiene**.

De ahí en adelante todo es manual, igual que hoy: tú recibes el comprobante,
lo validas contra tu banco y haces el registro. El bot nunca cobra, nunca
genera links de pago y nunca confirma un lugar.

Te avisa por correo (el que configures en el panel) cuando:
- un cliente llega al final del embudo y toca esperar su comprobante;
- el bot canaliza a alguien porque la pregunta no le toca;
- alguien manda una foto (probablemente un comprobante).

Cada correo lleva la conversación completa, así que no tienes que abrir el
panel para saber de qué se trata.

### De dónde le llega la gente

**Anuncios.** Todos tus conjuntos de anuncios están optimizados a
conversaciones, así que quien toca el anuncio cae directo en el chat. Meta
manda además el id del anuncio; si lo registras en el taller (campo *Ids de
anuncios*), el bot sabe de qué taller preguntan sin adivinar, incluso cuando
la persona abre el chat y no escribe nada.

**Comentarios.** El bot atiende los comentarios de todas tus publicaciones,
no solo de los anuncios. Deja una respuesta pública corta y amable firmada
como Endulcorito, y manda a esa persona un privado para abrir la
conversación. Si el comentario deja claro de qué taller preguntan y el copy
cabe, se lo manda de una vez.

> Meta permite **un solo mensaje privado por comentario**. Por eso el bot no
> reintenta ese envío, y por eso el privado lleva lo más útil que quepa.

Para que el bot no conteste sus propios comentarios (y se quede en un bucle),
configura `META_PAGE_ID` y `META_IG_ID`.

### Qué hace siempre, sin excepción

- Se presenta como asistente automático y da el aviso de privacidad en el
  primer mensaje.
- Respeta **BAJA**: deja de escribir y lo registra.
- Canaliza contigo ante alergias, reclamos, devoluciones, mayoreo, temas
  ajenos a talleres, cliente molesto o si le piden hablar con una persona.
- Nunca pide datos de tarjeta, CVV, NIP ni identificaciones.
- Nunca negocia precio ni inventa fechas, montos o promociones.

### Configurar Meta (una sola vez)

1. En [developers.facebook.com](https://developers.facebook.com) crea una app
   de tipo **Empresa** y agrégale los productos **WhatsApp** y **Messenger**.
2. En **Configuración → Básica**, copia la *Clave secreta de la app* a la
   variable `META_APP_SECRET` de Railway.
3. Inventa un texto cualquiera y ponlo en `META_VERIFY_TOKEN`.
4. En **WhatsApp → Configuración**, da de alta el webhook con la URL
   `https://www.endulcora.com/api/meta/webhook` y ese mismo token. Suscríbete
   al campo `messages`.
5. Repite el alta del webhook en **Messenger → Configuración** y en
   **Instagram**, con la misma URL y el mismo token.
6. Copia el token permanente y el id del número a `WHATSAPP_TOKEN` y
   `WHATSAPP_PHONE_NUMBER_ID`; el token de la página a `META_PAGE_TOKEN`.
7. No necesitas ninguna clave nueva de inteligencia artificial: el bot usa la
   misma `GEMINI_API_KEY` que ya mueve al asistente del sitio.

> **Ojo con el número.** Un número de WhatsApp solo puede estar en un lado: si
> migras el que usas hoy a la API, dejas de poder abrirlo en la app de
> WhatsApp de tu celular. Todo pasaría por el sistema.

### Configurar el bot (en `/admin` → Bot de ventas)

- **Enciéndelo.** Llega apagado: mientras esté apagado recibe y guarda los
  mensajes, pero no contesta nada.
- **Anticipo por persona, horas para pagar y correo de avisos.**
- **Los mensajes del embudo.** Se mandan tal cual los escribas. Aquí es donde
  pegas tus cuentas bancarias, en *Instrucciones de pago* — no viven en el
  código.
- **Los talleres.** Hay un botón que carga de golpe los 18 talleres de
  agosto-septiembre con sus copys y sus 37 fechas. Se puede repetir sin miedo:
  solo agrega lo que falte, nunca pisa lo que ya editaste. Para uno nuevo,
  ponle su palabra clave, su precio regular y el de promo, y escribe
  `{{FECHAS}}` en el copy donde van las fechas.
- **El aviso interno de cada taller.** Es una nota que el bot obedece pero
  nunca le repite al cliente: "solo mayores de 18", "no prometas control de
  glucosa", etc.
- **Ojo con las palabras clave repetidas.** COCTELES sirve para Coctelería
  Básica y para Coctelería Mexicana. El bot detecta la ambigüedad y pregunta
  cuál en vez de adivinar, así que no es un error tenerlas repetidas.
- **Liga las fechas.** En *Calendario*, cada día tiene ahora un selector
  **Taller del bot**, un **horario** y un **cupo**. Las fechas que ligues ahí
  son las que anuncia el copy. Si no ligas ninguna, el bot dice que no hay
  fechas abiertas en vez de inventarlas.

### Costo

El bot corre sobre el mismo modelo de Gemini que el asistente del sitio y con
la misma clave, así que no agrega ninguna cuenta ni ningún cobro nuevo.

Eso alcanza porque el trabajo del modelo aquí es chico: los copys los manda el
código palabra por palabra, y los montos y las fechas los calcula el sistema.
Lo único que decide el modelo es cuándo avanzar de paso y qué contestar a lo
que se sale del guion.

Ten en cuenta que el nivel gratuito de Google tiene límites de peticiones por
minuto y que Google puede usar esas conversaciones para mejorar sus modelos.
Como por aquí pasan nombres y teléfonos de clientes, conviene saberlo; el
nivel de pago de Google no usa los datos así.

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
