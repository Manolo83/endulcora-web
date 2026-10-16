# Google Sheets: la fila en "Inscritos 2026" se escribe sola

El servidor usa una **cuenta de servicio** (no tu cuenta de Google ni la de
nadie): es un "robot" con su propio correo (algo como
`endulcora-sheets@tu-proyecto.iam.gserviceaccount.com`) al que solo hay que
compartirle la hoja, como si fuera una persona mas.

## Lo que solo tu puedes hacer (una sola vez)

1. **Crea el proyecto y la cuenta de servicio** en
   <https://console.cloud.google.com/>:
   - Crea un proyecto (o usa el mismo de Google Ads si ya tienes uno).
   - APIs y servicios > Biblioteca > busca **Google Sheets API** > Habilitar.
   - IAM y administracion > Cuentas de servicio > **Crear cuenta de
     servicio**. Dale un nombre (ej. "endulcora-sheets"), no necesita ningun
     rol de IAM del proyecto (no toca nada fuera de la hoja que le compartas).
   - Entra a la cuenta de servicio creada > pestaña **Claves** > **Agregar
     clave > Crear clave nueva > JSON**. Se descarga un archivo `.json`.

2. **Comparte la hoja "Inscritos 2026"** con el correo de esa cuenta de
   servicio (el campo `client_email` del JSON), como colaborador con permiso
   de **Editor** — igual que compartirla con una persona mas.

3. **Copia dos datos del JSON descargado** a las variables de entorno del
   servidor (Railway > Variables):
   - `GOOGLE_SHEETS_CLIENT_EMAIL` = el valor de `client_email`.
   - `GOOGLE_SHEETS_PRIVATE_KEY` = el valor de `private_key` (empieza con
     `-----BEGIN PRIVATE KEY-----`). Pégalo completo, con los `\n` tal cual
     vienen en el JSON — el servidor los convierte solo a saltos de linea
     reales.
   - `GOOGLE_SHEETS_SPREADSHEET_ID` (opcional): el ID de la hoja, que es la
     parte de la URL entre `/d/` y `/edit`. Si no la pones, usa por defecto
     la de "Inscritos 2026" (`1-hL_6N2ix8J-peu-3GSM7EDhZu5DN8xFJPQP7fBMxJg`).

Con eso el servidor ya puede leer y escribir en la hoja sin que nadie tenga
que abrir el navegador cada vez.

## Antes de dejarlo escribiendo solo

En **Admin > Calendario de talleres** hay una tarjeta "Google Sheets" con un
botón **Ver columnas**: muestra las pestañas que existen y los encabezados
reales de la fila 1. Revísalo antes de confiar en el envío automático — si
el orden de columnas en `src/automatizacionesTaller.js` (función
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
