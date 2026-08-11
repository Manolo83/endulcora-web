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

## 12. Campañas de Meta Ads para Crenef (clínica)

En `src/ads/` está el código que crea en Meta Ads las campañas de las **terapias
de Crenef**. La mecánica está tomada de las campañas de Endulcora, que ya están
probadas, pero adaptada a una clínica. En vez de armar cada campaña a mano en el
Administrador de anuncios, llenas un archivo con las terapias y las sucursales,
y el script hace el resto.

### Cómo queda cada campaña

| Nivel | Cómo queda |
|---|---|
| **Campaña** | Una por cada terapia y cada sucursal. Nombre `PERMANENTE · Terapia · Sucursal`, objetivo Interacción, subasta, presupuesto en el conjunto |
| **Conjunto** | $150 MXN al día, máximo volumen, optimizado a conversaciones, destino WhatsApp, radio de 10 km alrededor de la sucursal y solo gente que vive ahí. La edad se define por terapia |
| **Anuncio** | Imagen única, botón "Enviar mensaje por WhatsApp" con el mensaje ya escrito, copy en 4 bloques: qué atiende, cómo es la sesión, quién la da, y agendar la valoración |

### Qué cambió respecto al machote de talleres de Endulcora

Una clínica no se anuncia como una escuela de talleres, así que:

- **Las terapias no tienen fecha de fin.** Un taller se acaba el día que se da;
  una terapia es un servicio permanente. Por eso las campañas se llaman
  `PERMANENTE` y el anuncio corre sin `end_time`. Solo le pones fecha si es una
  promoción de temporada, y entonces se nombra con el mes (`OCT26 · ...`).
- **La edad se define por terapia, no una sola para todo.** Una terapia infantil
  le habla a los papás (28 a 50), no a los niños; una de adultos mayores le habla
  a los hijos o al paciente (45 a 65). Poner 25-55 para todo, como en Endulcora,
  desperdicia presupuesto.
- **El radio pasó de 7 a 10 km**, y se puede subir por sucursal. Por un taller de
  4 horas la gente no cruza la ciudad; por una terapia sí se traslada más.
- **El copy cambia de fórmula.** En un taller el gancho es el contraste y el
  cierre es el anticipo. En salud lo que convence es quién da la terapia
  (cédula, especialidad, años de experiencia) y que el primer paso sea chico:
  una valoración, no un tratamiento.

### La política de salud de Meta (lee esto antes de escribir los copys)

Es la razón número uno por la que rechazan anuncios de clínica. La regla: **el
anuncio no puede dar a entender que ya sabes algo de la salud de quien lo ve.**

| Lo rechazan | Pasa sin problema |
|---|---|
| "¿Sufres de ansiedad?" | "Atendemos ansiedad" |
| "Si tu hijo tiene autismo..." | "Terapia de lenguaje para niños con autismo" |
| "¿Te duele la espalda?" | "Fisioterapia para dolor de espalda" |
| "Resultados garantizados" | "Sesiones de 45 minutos, una vez por semana" |
| "Mira el antes y después" | (prohibido, también en la imagen) |

El truco que siempre funciona: habla de lo que la clínica hace y a quién atiende,
en tercera persona. Nunca de lo que la persona "tiene" o "sufre".

`src/ads/politicas-salud.js` revisa esto solo cada vez que corres el script, te
dice qué frase está mal y cómo reescribirla, y **se niega a crear las campañas**
hasta que lo arregles (o uses `--forzar`).

### Cómo lanzarlas

1. **Consigue el token.** En [developers.facebook.com](https://developers.facebook.com)
   > Herramientas > Explorador de la API Graph: elige tu app, pide el permiso
   `ads_management` y genera el token. Pégalo en tu `.env` como `META_ADS_TOKEN`.
   Solo vive en tu máquina; el sitio en Railway no lo necesita.

2. **Llena `src/ads/crenef.config.js`.** Es el único archivo que se edita. Todo
   lo que dice `PENDIENTE` es un dato de la clínica que hay que poner: la cuenta
   publicitaria, el WhatsApp que recibe los mensajes, las sucursales con su
   dirección y coordenadas, y cada terapia con su copy, su imagen y su rango de
   edad.

3. **Mira qué se va a crear**, sin tocar Meta todavía:

   ```bash
   npm run ads:crenef
   ```

   Te enseña la lista de campañas, el gasto diario total, las edades y los radios,
   y la revisión de política de salud. Si falta algún dato, te dice cuál en vez
   de mandar la campaña incompleta a Meta.

4. **Créalas de verdad:**

   ```bash
   npm run ads:crenef -- --crear
   ```

   Todo nace **en pausa**: campañas, conjuntos y anuncios. Las revisas en el
   Administrador de anuncios y las prendes tú. Nada empieza a gastar solo.

### Antes de la primera corrida

La página de Facebook de Crenef (`112678221416248`) todavía no está ligada a
ninguna cuenta publicitaria, y la cuenta vacía `376340486445864` no tiene
método de pago. Las dos cosas se arreglan en Business Manager (**Configuración
del negocio > Cuentas publicitarias > Agregar activos**); si no, Meta acepta
crear las campañas pero no las entrega.

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
