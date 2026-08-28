# Reconocimientos Endulcora

CRM interno para generar y enviar los reconocimientos de cada taller.

**Es independiente de endulcora.com.** No es una sección de `/admin`: es otro
programa, en otro servidor, con otra dirección y otra contraseña. Lex y Alek
la abren desde su propia computadora como cualquier página, sin tocar el sitio
público ni su panel de administración. Si el sitio se cae, esto sigue; si aquí
se equivocan, el sitio no se entera.

## Qué hace

1. Eliges el taller de una lista con buscador (138 talleres ya cargados).
2. Escribes los nombres de quienes asistieron, uno por renglón. Si la persona
   ya está en la base, la app le encuentra el correo sola.
3. Ves cómo va a quedar el reconocimiento **antes** de mandar nada.
4. Le llega a cada quien por correo, con su reconocimiento en PDF y su folio.

El taller, el folio consecutivo y el mes se llenan solos: tú nada más capturas
el nombre.

Además guarda la ficha de cada clienta: sus datos, tus notas sobre ella y el
historial de todo lo que se le ha enviado, con folio y fecha. Se abre haciendo
clic en cualquier renglón de la lista de contactos o buscándola desde Inicio.

## Poner a andar el proyecto

```bash
cd envios
npm install
cp .env.example .env      # y llena los datos
npm start                 # queda en http://localhost:3100
```

### Variables de entorno

| Variable | Para qué sirve |
|---|---|
| `APP_PASSWORD` | La contraseña con la que entran Lex y Alek. |
| `SESSION_SECRET` | Cualquier texto largo al azar, para firmar la sesión. |
| `RESEND_API_KEY` | Llave de Resend, para poder enviar los correos. |
| `RESEND_FROM` | Remitente. El dominio debe estar verificado en Resend. |
| `DATA_DIR` | Carpeta de datos. En Railway apúntala a un volumen. |


## Publicarla para que Lex y Alek entren desde su compu

Mientras corra solo en una computadora, nadie más la alcanza. Hay que
publicarla, y se hace como **un segundo servicio en Railway**, aparte del de
endulcora.com. Comparten repositorio pero no comparten nada más: distinta
dirección, distinta contraseña, distintos datos.

1. En [railway.app](https://railway.app), dentro del mismo proyecto:
   **New → GitHub Repo → `Manolo83/endulcora-web`**.
2. En el servicio nuevo, **Settings → Root Directory**, escribe `envios`.
   Sin esto Railway construiría el sitio público otra vez.
3. **Variables**, agrega:

   | Variable | Qué poner |
   |---|---|
   | `APP_PASSWORD` | La contraseña que van a usar Lex y Alek. |
   | `SESSION_SECRET` | Un texto largo al azar. |
   | `RESEND_API_KEY` | Tu llave de Resend. |
   | `RESEND_FROM` | `Endulcora <reconocimientos@envios.endulcora.com>` |
   | `DATA_DIR` | `/datos` |

   `PORT` lo pone Railway solo.
4. **Volumes → New Volume**, con ruta `/datos`. Ahí viven los contactos, el
   historial y la plantilla. Sin volumen se borra todo en cada despliegue.
5. Railway te da una dirección tipo
   `endulcora-envios-production.up.railway.app`. Con esa ya pueden entrar.
6. Opcional, para que sea fácil de recordar: **Settings → Networking → Custom
   Domain** y usa un subdominio, por ejemplo `reconocimientos.endulcora.com`.

### Que no se confunda con el sitio

Conviene que el remitente de los correos salga de un subdominio propio
(`envios.endulcora.com`), verificado aparte en Resend. Así, si un envío masivo
llegara a afectar la reputación del remitente, no arrastra al correo de la
tienda.

## Lo único que falta para poder enviar: la firma del Chef

La app ya trae puesta la plantilla del reconocimiento, con el logotipo actual.
No hay que subir nada... salvo la firma.

La firma va aparte porque es lo único que la app no puede traer de fábrica. En
**Ajustes ▸ Firma del Chef** subes la imagen y listo. Mientras falte, el envío
queda **bloqueado a propósito**: un reconocimiento con el espacio de la firma en
blanco, junto a un número de permiso, es peor que no mandarlo.

El archivo debe ir:

- **Sin la raya de abajo.** Esa raya ya está dibujada en la plantilla y la firma
  se apoya sobre ella. Si la imagen trae su propia raya, salen dos encimadas.
- Con fondo transparente (PNG), para que no tape la raya con un rectángulo blanco.

### Cambiar la plantilla (opcional)

En **Ajustes ▸ Plantilla** puedes reemplazarla por otra, por ejemplo una página
exportada de Canva. No importa que traiga los datos de otra persona: la app borra
el nombre, el taller, el folio y el mes, y escribe los nuevos encima.

### Cargar los contactos

En Google Sheets abre **Base de Datos Endulcora (respuestas)** y usa
*Archivo ▸ Descargar ▸ CSV*. Sube ese archivo en *Ajustes*.

La hoja acumula varias versiones del formulario encimadas, así que al importar
la app hace tres limpiezas:

- **Junta los nombres partidos.** Hay filas donde "Nombre completo" trae solo el
  apellido y el nombre de pila vive en otras dos columnas. `Basaldúa` se
  convierte en `Elsa Judith Lorenzana Basaldúa`.
- **Ignora la columna de contacto de emergencia.** Su encabezado dice "Nombre
  completo y número celular", y si se tomara como fuente acabaría imprimiendo un
  teléfono dentro de un reconocimiento.
- **Empareja a las personas repetidas** por correo y avisa de los que traen
  errores de dedo en el dominio.

De las 3,535 filas de la hoja salen 3,396 personas únicas.

## Folios

El folio arranca en 2964, siguiendo la numeración de la hoja
"RECONOCIMIENTOS HECHOS", y sube solo. **Un folio solo se consume cuando el
correo sale**: si un envío falla, ese folio queda libre para el reintento, para
que la numeración no se quede con huecos.

## Si el texto no queda igual al de Canva

La app dibuja con las tipografías del sistema. Para que quede idéntico, pon el
archivo `.ttf` de la fuente del diseño en la carpeta `fuentes/` y reinicia; se
carga sola.

Las posiciones del nombre, el taller, el folio y la línea descriptiva están en
`src/reconocimiento.js`, en `ZONAS_POR_DEFECTO`; las del logotipo, en
`LOGO_POR_DEFECTO`. Van como fracción de la hoja para que funcionen a cualquier
resolución de exportación.

Cada zona se queda corta a propósito para no morder lo que no cambia: la de
`nombre` termina antes de la línea dorada, y la de `folio` antes del renglón del
permiso. El borrado quita solo los píxeles más oscuros que el fondo, así que el
óvalo beige y los adornos de las esquinas se quedan intactos.

## Todavía no está hecho

- Envío de los ebooks de cada taller (queda para una segunda etapa).
- Lectura directa de Google Drive sin pasar por el CSV.
- Cada quien con su propio usuario: hoy la contraseña es una sola y
  compartida; al entrar cada quien dice si es Lex o Alek, y eso es lo que
  queda registrado en el historial.
