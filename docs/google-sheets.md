# Google Sheets: "Inscritos 2026" y el calendario físico se leen/escriben solos

El servidor usa una **cuenta de servicio** (no tu cuenta de Google ni la de
nadie): es un "robot" con su propio correo (algo como
`endulcora-sheets@tu-proyecto.iam.gserviceaccount.com`) al que solo hay que
compartirle los archivos, como si fuera una persona mas. La misma cuenta
sirve para los dos archivos:
- **"Inscritos 2026"**: el servidor le AGREGA una fila por cada inscripción
  a un taller (pagada o no), con nombre, anticipo, saldo y fecha/hora.
- **El calendario físico** (el Excel con los bloques por sucursal y semana):
  el servidor lee cada 30 minutos la pestaña **"MES ACTUAL"** (solo esa — las
  pestañas de años pasados, 2021...2026, y las de "Ideas"/"Lista
  Blanca"/"RESUBIDAS"/"Lista Negra" nunca se leen, para no importar
  historial viejo como si fuera del año que entra) y da de alta en el sitio
  los talleres nuevos que encuentra — nunca borra ni modifica uno que ya
  existe.

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

El servidor solo llena lo que viene del pago en línea (nombre, montos,
fecha/hora, "PAGADO", "Mercado Pago") y deja vacías las columnas que ahí se
capturan a mano para venta cruzada (Recetario, MATERIAL, MEMBRESIA,
BETTERWARE, APARTADO) — nunca inventa un dato que no sale del pago.

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

## Qué pasa mientras no esté configurado

Nada se rompe: el aviso al equipo y el correo de confirmación siguen
saliendo normal, y las inscripciones pagadas que todavía no se mandaron a
Sheets se quedan guardadas (`sheetsSincronizado: false`) — en cuanto se
configure, el servidor las manda solas en el siguiente barrido (cada 30
minutos), sin perder ninguna.
