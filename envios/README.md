# Reconocimientos Endulcora

App interna para generar y enviar los reconocimientos de cada taller. Es
independiente de endulcora.com: vive en su propio servidor, con su propia
contraseña, y la usan Lex y Alek.

## Qué hace

1. Eliges el taller de una lista con buscador (138 talleres ya cargados).
2. Escribes los nombres de quienes asistieron, uno por renglón. Si la persona
   ya está en la base, la app le encuentra el correo sola.
3. Ves cómo va a quedar el reconocimiento **antes** de mandar nada.
4. Le llega a cada quien por correo, con su reconocimiento en PDF y su folio.

El taller, el folio consecutivo y el mes se llenan solos: tú nada más capturas
el nombre.

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

## Los dos pasos que hay que hacer una sola vez

### 1. Subir la plantilla del reconocimiento

En Canva abre **RECONOCIMIENTOS 7**, exporta **una** página como PNG y súbela en
la pestaña *Ajustes*. No importa que traiga el nombre de otra persona: la app
borra el nombre, el taller, el folio y el mes, y escribe los nuevos encima
respetando el diseño (el óvalo beige, el logo, la firma y la línea del permiso
se quedan intactos).

### 2. Cargar los contactos

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
`src/reconocimiento.js`, en `ZONAS_POR_DEFECTO`, expresadas como fracción de la
hoja para que funcionen a cualquier resolución de exportación.

## Todavía no está hecho

- Envío de los ebooks de cada taller (queda para una segunda etapa).
- Lectura directa de Google Drive sin pasar por el CSV.
