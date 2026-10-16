# Google Sheets: "Inscritos 2026" y el calendario físico se leen/escriben solos

El servidor usa una **cuenta de servicio** (no tu cuenta de Google ni la de
nadie): es un "robot" con su propio correo (algo como
`endulcora-sheets@tu-proyecto.iam.gserviceaccount.com`) al que solo hay que
compartirle los archivos, como si fuera una persona mas. La misma cuenta
sirve para los dos archivos:
- **"Inscritos 2026"**: el servidor le AGREGA una fila por cada inscripción
  a un taller (pagada o no), con nombre, cuánto dio de anticipo y la fecha
  en la que asiste. Nunca pone color ni formato en ninguna celda — eso
  (ej. marcar en verde a quien ya asistió) lo hace el equipo a mano.
- **El calendario físico** (el Excel con los bloques por sucursal y semana):
  el servidor lee cada 30 minutos la pestaña **del año en curso** (ej.
  "2026" — se calcula sola con la fecha de hoy, no hay que tocar nada
  cuando cambie el año). Las pestañas de años pasados y las de "Ideas",
  "Lista Blanca", "MES ACTUAL" (sin usar), "RESUBIDAS", "Lista Negra" nunca
  se leen. Dentro de la pestaña del año, los talleres con fecha ya pasada
  tampoco se importan (no tiene caso llenar el calendario de cosas viejas
  cada barrido). Da de alta en el sitio los talleres nuevos que encuentra —
  nunca borra ni modifica uno que ya existe.

## Lo que solo tu puedes hacer (una sola vez)

1. **Crea el proyecto y la cuenta de servicio** en
   <https://console.cloud.google.com/> (si Google te pide activar la
   verificación en dos pasos de tu cuenta primero, hazlo ahí mismo):
   - Crea un proyecto (o usa el mismo de Google Ads si ya tienes uno).
   - APIs y servicios > Biblioteca > busca **Google Sheets API** > Habilitar.
     Repite la búsqueda con **Google Drive API** > Habilitar (hace falta
     para leer el archivo del calendario).
   - IAM y administracion > Cuentas de servicio > **Crear cuenta de
     servicio**. Dale un nombre (ej. "endulcora-sheets"), no necesita ningun
     rol de IAM del proyecto (no toca nada fuera de los archivos que le
     compartas).
   - Entra a la cuenta de servicio creada > pestaña **Claves** > **Agregar
     clave > Crear clave nueva > JSON**. Se descarga un archivo `.json`.

2. **Comparte los DOS archivos** con el correo de esa cuenta de servicio (el
   campo `client_email` del JSON), como colaborador con permiso de
   **Editor** — igual que compartirlos con una persona mas:
   - La hoja **"Inscritos 2026"**.
   - El Excel del **calendario físico** (el de los bloques NATIVITAS/DIVISIÓN
     por semana).

3. **Copia dos datos del JSON descargado** a las variables de entorno del
   servidor (Railway > Variables):
   - `GOOGLE_SHEETS_CLIENT_EMAIL` = el valor de `client_email`.
   - `GOOGLE_SHEETS_PRIVATE_KEY` = el valor de `private_key` (empieza con
     `-----BEGIN PRIVATE KEY-----`). Pégalo completo, con los `\n` tal cual
     vienen en el JSON — el servidor los convierte solo a saltos de linea
     reales.
   - `GOOGLE_SHEETS_SPREADSHEET_ID` (opcional): el ID de "Inscritos 2026",
     que es la parte de la URL entre `/d/` y `/edit`. Si no la pones, usa el
     que ya tiene por defecto.
   - `GOOGLE_SHEETS_CALENDARIO_ID` (opcional): el ID del Excel del
     calendario físico, misma idea. También tiene un valor por defecto.

Con eso el servidor ya puede leer y escribir en la hoja sin que nadie tenga
que abrir el navegador cada vez.

## Las columnas (ya confirmadas contra la hoja real)

Cada taller tiene su propia pestaña (ej. "Velas comestibles" para Nativitas,
"Palomitas division" para División — las de División terminan en " div", y
el servidor adivina eso solo a partir del nombre de la sede salvo que se fije
un nombre distinto en el campo "Pestaña en Inscritos 2026" del taller en
/admin). El orden de columnas, confirmado con el dueño del sitio:

```
NOMBRE | ANTICIPO | DEBE | DIA/HORA | RECONOCIMIENTO | Recetario | MATERIAL
| MEMBRESIA | BETTERWARE | APARTADO | PAGO | ESTATUS | FORMA DE PAGO
```

El servidor solo llena NOMBRE, ANTICIPO y DIA/HORA — el resto de la fila,
incluida DEBE, se deja en blanco a propósito para que el equipo la capture
a mano (Recetario, MATERIAL, MEMBRESIA, BETTERWARE, APARTADO, PAGO,
ESTATUS, FORMA DE PAGO, y también DEBE). Nunca pone color ni formato en
ninguna celda.

## Antes de dejarlo escribiendo solo

En **Admin > Calendario de talleres** hay una tarjeta "Google Sheets" con un
botón **Ver columnas**: muestra las pestañas que existen y los encabezados
reales de la fila 1 — útil para confirmar que una pestaña nueva (un taller
que todavía no tiene su hoja) tiene los mismos encabezados antes de
confiar en el envío automático. Si el orden de columnas en
`src/automatizacionesTaller.js` (función
`filaParaSheets`) no coincide con el real, ahí se corrige.

Cada taller del calendario puede tener su propio nombre de pestaña (campo
"Pestaña en Inscritos 2026" al editarlo en /admin); si se deja vacío, se usa
el nombre del taller tal cual.

Si la pestaña de un taller todavía no existe en "Inscritos 2026" (un taller
recién creado, sin ninguna inscripción todavía), el servidor la crea sola
con los encabezados de arriba en cuanto llega la primera inscripción — no
hay que crearla a mano de antemano.

## Qué pasa mientras no esté configurado

Nada se rompe: el aviso al equipo y el correo de confirmación siguen
saliendo normal, y las inscripciones pagadas que todavía no se mandaron a
Sheets se quedan guardadas (`sheetsSincronizado: false`) — en cuanto se
configure, el servidor las manda solas en el siguiente barrido (cada 30
minutos), sin perder ninguna.
