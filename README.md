# Endulcora · Estudio Gastronómico

Sitio web de Endulcora con panel de administración propio: puedes publicar
anuncios y subir fotos/videos desde `/admin` y aparecen al instante en la
página pública, sin tocar código.

## Qué incluye

- **Sitio público** (`public/index.html`): la página original, con dos
  secciones nuevas y dinámicas — **Anuncios** y **Galería** — que se llenan
  solas leyendo datos del servidor.
- **Panel de administración** (`/admin`): protegido con contraseña. Permite:
  - Publicar/ocultar/borrar anuncios.
  - Subir fotos y videos (hasta 150 MB) o pegar un enlace de YouTube/Vimeo.
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
4. **Añade un Volume** (para que las fotos/videos y los anuncios no se
   borren cada vez que se reinicia el servicio):
   - En el servicio, pestaña **Volumes → New Volume**.
   - Móntalo en la ruta `/data`.
5. **Variables de entorno** (pestaña **Variables**):
   | Variable | Valor |
   |---|---|
   | `ADMIN_PASSWORD` | una contraseña fuerte para entrar a `/admin` |
   | `SESSION_SECRET` | un texto largo y aleatorio (cualquier cadena de 32+ caracteres) |
   | `DATA_DIR` | `/data` |
   | `NODE_ENV` | `production` |

   Railway define `PORT` automáticamente, no hace falta agregarlo.
6. Railway construye y despliega. Al terminar te da una URL tipo
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
5. **Salir** cierra la sesión del panel.

No hace falta redeploy ni tocar código para publicar contenido nuevo — todo
pasa por el panel.

## 7. Seguridad y respaldos

- Cambia `ADMIN_PASSWORD` a algo fuerte y único; no lo compartas fuera del
  equipo de confianza. No hay registro público de usuarios: es una sola
  contraseña de administrador.
- El panel está bloqueado para buscadores (`robots.txt` y meta `noindex`) y
  tiene límite de intentos de inicio de sesión (20 cada 15 minutos) para
  frenar ataques de fuerza bruta.
- Todo el contenido (anuncios y archivos subidos) vive en el Volume de
  Railway montado en `/data`. Railway conserva los Volumes entre
  despliegues, pero **no hay respaldo automático en la nube**: de vez en
  cuando descarga una copia con `railway volume` / `railway ssh` o
  simplemente vuelve a subir tus fotos/videos importantes a otro lugar
  (Google Drive, etc.) como respaldo.

## 8. Notas técnicas y mejoras futuras (opcionales)

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
