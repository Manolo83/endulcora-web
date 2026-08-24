# Google Ads: una cuenta por negocio, todo administrado desde aqui

Los cuatro negocios (Endulcora, CRENEF, LEVENT e Instituto Justo) tienen su
**propia cuenta de Google Ads**: presupuesto, facturacion, campanas y datos por
separado, como debe ser. Lo que las une es una **cuenta administradora (MCC)**
que las tiene a las cuatro colgando de ella.

```
        Cuenta administradora (MCC)  <- un solo permiso, un solo token
        |
        +-- Endulcora          (cuenta propia, factura propia)
        +-- CRENEF             (cuenta propia, factura propia)
        +-- LEVENT             (cuenta propia, factura propia)
        +-- Instituto Justo    (cuenta propia, factura propia)
```

Con el permiso del MCC, este servidor puede crear cuentas, dar de alta
conversiones y sacar reportes de las cuatro sin entrar a la interfaz de Google.

---

## Lo que solo tu puedes hacer (necesita navegador y tu cuenta de Google)

Estas cosas Google no las deja hacer por API, hay que hacerlas a mano una vez:

1. **Crear la cuenta administradora (MCC).** HECHO: es la **894-945-9356**
   (`8949459356` sin guiones), la que muestra la seccion "Cuentas" en el menu
   de la izquierda. Ahi mismo, con el boton **+**, se crean las subcuentas de
   cada negocio (y tambien se pueden crear desde aqui, ver mas abajo).

2. **Pedir el token de desarrollador.**
   Dentro del MCC: Herramientas y configuracion > Configuracion > **Centro de
   API**. Solicita el token y pide **acceso basico** (el de prueba NO sirve: con
   el, la API no puede tocar cuentas reales). La aprobacion suele tardar de
   unas horas a un par de dias. Copia el token.

3. **Crear el cliente OAuth** (es lo que le da permiso a este servidor).
   En <https://console.cloud.google.com/>:
   - Crea un proyecto (por ejemplo "Ads negocios").
   - APIs y servicios > Biblioteca > busca **Google Ads API** > Habilitar.
   - Pantalla de consentimiento: tipo **Externo**, con tu correo como usuario de
     prueba. No hace falta publicarla ni verificarla.
   - Credenciales > Crear credenciales > **ID de cliente de OAuth** > tipo
     **Aplicacion web**, y en "URI de redireccionamiento autorizados" pega:

     ```
     https://www.endulcora.com/api/google-ads/oauth/callback
     ```

     (Con el tipo **Aplicacion de escritorio** tambien funciona, pero entonces
     el permiso se consigue con los comandos de consola en vez del enlace de un
     clic.)
   - Copia el **ID de cliente** y el **secreto**.

4. **Facturacion de cada cuenta.** Cuando una cuenta ya exista, hay que meterle
   la tarjeta o los datos fiscales desde la interfaz (Facturacion > Configuracion).
   Sin eso la cuenta existe pero no publica anuncios. Esto no se puede por API.

5. **Verificacion del anunciante** (Google la pide a los pocos dias de empezar a
   gastar): documentos de identidad o del negocio. Tambien es manual.

Todo lo demas se hace desde aqui.

---

## Configuracion (una sola vez)

Con los datos de arriba, guarda estas variables en Railway (Variables) y en tu
`.env` local:

```
GOOGLE_ADS_CLIENT_ID=...           # del cliente OAuth
GOOGLE_ADS_CLIENT_SECRET=...       # del cliente OAuth
GOOGLE_ADS_DEVELOPER_TOKEN=...     # del Centro de API del MCC
GOOGLE_ADS_MANAGER_ID=8949459356   # ID del MCC, sin guiones
```

Luego el permiso permanente. Hay dos formas; la primera no exige copiar nada:

**A. Un clic (recomendada).** Con `GOOGLE_ADS_ADMIN_TOKEN` ya puesto:

```bash
curl -s -H "Authorization: Bearer $TOKEN" $BASE/oauth/inicio
```

Devuelve un enlace de Google. Lo abre el duenio de la cuenta administradora,
acepta, y el servidor guarda el permiso solo, en la base de datos. El enlace
dura 15 minutos y sirve una sola vez. Para comprobar o revocar:

```bash
curl -s -H "Authorization: Bearer $TOKEN" $BASE/oauth/estado
curl -s -X DELETE -H "Authorization: Bearer $TOKEN" $BASE/oauth
```

**B. Por consola**, si el cliente OAuth es de tipo escritorio:

```bash
node scripts/google-ads.js url-permiso     # abre el enlace que imprime
node scripts/google-ads.js refresh-token <el-codigo-de-la-url>
```

Aqui si hay que guardar el resultado como `GOOGLE_ADS_REFRESH_TOKEN`. En
cualquiera de las dos formas, el permiso no caduca: tratalo como una contrasena.
Si la variable de entorno existe, manda sobre lo guardado en la base de datos.

Comprueba que todo quedo bien:

```bash
node scripts/google-ads.js estado
```

---

## Crear las cuatro cuentas

Una por negocio (todas en MXN y zona horaria de Ciudad de Mexico; la moneda y
la zona **no se pueden cambiar despues**):

```bash
node scripts/google-ads.js crear-cuenta endulcora
node scripts/google-ads.js crear-cuenta crenef
node scripts/google-ads.js crear-cuenta levent
node scripts/google-ads.js crear-cuenta instituto-justo
```

Cada comando imprime el ID de la cuenta creada y la variable que hay que
guardar en Railway, por ejemplo:

```
GOOGLE_ADS_CUSTOMER_ENDULCORA=9876543210
```

Despues de guardarlas, `node scripts/google-ads.js estado` debe mostrar las
cuatro con `[OK]`.

> Si el token de desarrollador todavia no tiene acceso basico, crea las cuentas
> a mano desde el MCC (boton **+** > "Crear cuenta nueva") y solo guarda los IDs
> en esas mismas variables: el resto de la herramienta funciona igual.

---

## Conversiones (lo que hace que los anuncios aprendan)

```bash
node scripts/google-ads.js crear-conversiones endulcora
node scripts/google-ads.js conversiones endulcora
```

Da de alta cuatro acciones estandar en la cuenta: **Compra (web)**, **Inicio de
compra**, **Contacto por WhatsApp** y **Registro / formulario**.

Para el sitio de Endulcora, guarda en Railway lo que imprime el comando:

```
GOOGLE_ADS_ID=AW-XXXXXXXXXX                      # etiqueta de la cuenta
GOOGLE_ADS_CONVERSION_COMPRA=AW-XXXXXXXXXX/AbCd  # etiqueta de la compra
GOOGLE_ADS_CONVERSION_COMPRA_ID=1234567890       # la misma, para el servidor
```

Con eso, el sitio:

- carga la etiqueta de Google en todas las paginas (`/api/medicion` le dice
  cual, asi que cambiar el ID no requiere volver a desplegar);
- guarda el `gclid` del anuncio en una cookie de 90 dias al llegar el visitante;
- cuenta la compra en `/gracias` desde el navegador; y
- **ademas** la manda desde el servidor cuando Mercado Pago confirma el pago
  (`src/googleAds/conversiones.js`), igual que ya se hace con Meta. Las dos
  llevan el mismo `transaction_id` (`orden-123`), asi que Google las une y
  cuenta una sola venta.

Los otros tres negocios usan las mismas acciones de conversion en sus propias
cuentas; cuando tengan sitio propio, se les pone su etiqueta ahi.

---

---

## Operar las cuentas desde Claude (panel /api/google-ads)

La herramienta de linea de comandos sirve cuando se corre dentro del servidor.
Para poder pedir las cosas desde fuera — desde un chat, desde el celular — el
servidor expone el mismo control por HTTP, protegido con un token **propio**
(nada de Google viaja fuera de Railway; el token se cambia cuando quieras sin
tocar la configuracion de Google).

Actívalo con una variable mas:

```
GOOGLE_ADS_ADMIN_TOKEN=<algo largo y aleatorio>
```

Genera uno con:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Sin esa variable, el panel contesta 503 y queda apagado.

### Lo que se puede pedir

Todas las llamadas llevan el encabezado `Authorization: Bearer <token>`:

```bash
BASE=https://www.endulcora.com/api/google-ads
TOKEN=<el token>

# Que cuenta existe y cual falta
curl -s -H "Authorization: Bearer $TOKEN" $BASE/estado

# Todo lo que cuelga de la cuenta administradora
curl -s -H "Authorization: Bearer $TOKEN" $BASE/cuentas

# Crear la cuenta de un negocio
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"negocio":"crenef"}' $BASE/cuentas

# Conversiones de una cuenta (ver / dar de alta las estandar)
curl -s -H "Authorization: Bearer $TOKEN" $BASE/conversiones/endulcora
curl -s -X POST -H "Authorization: Bearer $TOKEN" $BASE/conversiones/endulcora

# Gasto y resultados
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/reporte?dias=30"
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/reporte?negocio=endulcora&dias=7"

# Cualquier otra pregunta, en el lenguaje de consultas de Google (solo lectura)
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"negocio":"endulcora","query":"SELECT campaign.name, metrics.clicks FROM campaign WHERE segments.date DURING LAST_7_DAYS"}' \
  $BASE/consulta
```

`/consulta` rechaza cualquier cosa que no empiece con `SELECT`: desde ahi no se
puede borrar ni modificar nada.

### Cuidados

- El token da control sobre las cuatro cuentas: guardalo como una contrasena y
  cambialo si alguna vez se comparte de mas.
- El panel esta limitado a 60 peticiones cada 5 minutos.
- Las respuestas nunca incluyen credenciales de Google, solo cuales estan
  configuradas y cuales faltan.

## El dia a dia

```bash
node scripts/google-ads.js estado                 # que cuenta existe y cual falta
node scripts/google-ads.js cuentas                # todo lo que cuelga del MCC
node scripts/google-ads.js reporte                # los cuatro negocios, 30 dias
node scripts/google-ads.js reporte endulcora 7    # un negocio, 7 dias
node scripts/google-ads.js conversiones crenef    # conversiones de una cuenta
```

En Railway se corren igual, desde la consola del servicio.

---

## Notas

- **Version de la API**: se fija en `GOOGLE_ADS_API_VERSION` (por omision `v21`).
  Google retira cada version mas o menos al ano; si un dia la API contesta que
  la version no existe, sube ese numero.
- **Seguridad**: el refresh token y el token de desarrollador dan control total
  sobre las cuatro cuentas. Van solo en variables de entorno, nunca en el codigo
  ni en GitHub.
- **Nada de esto frena una venta**: si Google falla o falta configuracion, el
  envio de la conversion se registra en la consola y el pedido sigue su curso.
