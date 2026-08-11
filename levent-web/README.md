# Levent · landing de campana para Meta Ads

Landing de una sola pagina pensada para recibir el trafico de los anuncios de
Meta (Facebook e Instagram), capturar leads, mandarlos a WhatsApp y cobrar en
linea con Mercado Pago — con toda la medicion que Meta necesita para optimizar
la campana.

Misma arquitectura que el sitio de Endulcora: Node.js + Express, contenido
editable desde `/admin` sin tocar codigo, datos en PostgreSQL y despliegue en
Railway.

## Que mide y por que

Meta cobra por resultados, y solo puede optimizar lo que ve. Este sitio le
manda cinco eventos:

| Evento | Cuando pasa | Para que sirve |
|---|---|---|
| `PageView` | Alguien abre la landing | Publico de remarketing |
| `ViewContent` | Llega a ver la oferta y el precio | Remarketing a quien mostro interes real |
| `Lead` | Manda el formulario | **La conversion principal a optimizar** |
| `Contact` | Pulsa el boton de WhatsApp | Segunda conversion, suele cerrar mas rapido |
| `CompleteRegistration` | Llega a `/gracias` | Confirma el registro completo |
| `InitiateCheckout` | Abre la pasarela de pago | Senal intermedia de compra |
| `Purchase` | Mercado Pago aprueba el pago | Ingreso real, para calcular el ROAS |

Cada evento sale **dos veces**: una desde el navegador (Meta Pixel) y otra
desde este servidor (Conversions API), con el mismo `event_id`. Meta reconoce
el par y cuenta uno solo.

Esto no es un adorno tecnico: hoy entre el 20% y el 40% de los eventos del
navegador nunca llegan a Meta (bloqueadores de anuncios, iOS con seguimiento
limitado, pestanas que se cierran antes de tiempo). Sin la Conversions API la
campana reporta menos conversiones de las reales, y el algoritmo aprende con
datos incompletos: paga mas por cada lead. Con las dos vias, lo que el
navegador no alcanza a mandar lo manda el servidor.

Los datos personales (correo, telefono, nombre) nunca salen en claro: van
hasheados con SHA-256 sobre el valor normalizado, como exige Meta.

## 1. Desarrollo local

```bash
npm install
cp .env.example .env      # edita ADMIN_PASSWORD, SESSION_SECRET y DATABASE_URL
npm start
```

- Landing: `http://localhost:3000`
- Panel: `http://localhost:3000/admin`

Necesitas un PostgreSQL corriendo (local o el de Railway). Sin
`DATABASE_URL` el servidor no arranca a proposito, para no perder leads en
memoria sin darte cuenta.

## 2. Desplegar en Railway

1. Entra a [railway.app](https://railway.app) con tu cuenta de GitHub.
2. **New Project → Deploy from GitHub repo** y elige `Manolo83/levent-web`.
   Railway detecta Node.js solo (`npm install` + `npm start`), no hace falta
   Dockerfile.
3. **New → Database → Add PostgreSQL**. Railway crea `DATABASE_URL` sola.
4. **Volumes → New Volume**, montado en `/data` (solo para las imagenes que
   subas desde el panel).
5. **Variables**:

   | Variable | Valor |
   |---|---|
   | `ADMIN_PASSWORD` | contrasena fuerte para `/admin` |
   | `SESSION_SECRET` | texto aleatorio de 32+ caracteres |
   | `DATA_DIR` | `/data` |
   | `NODE_ENV` | `production` |
   | `SITE_URL` | la URL final con https, sin diagonal al final |
   | `META_PIXEL_ID` | ver seccion 3 |
   | `META_ACCESS_TOKEN` | ver seccion 3 |
   | `MP_ACCESS_TOKEN` | ver seccion 5 |

`PORT` lo pone Railway. Cada `git push` vuelve a desplegar solo.

**`SITE_URL` tiene que ser la URL real desde el primer dia**: de ahi salen las
URL de retorno de Mercado Pago y la `event_source_url` de cada evento. Si
apunta a otro lado, Meta descarta los eventos por dominio no verificado.

## 3. Conectar el Pixel y la Conversions API

1. Entra a [business.facebook.com/events_manager](https://business.facebook.com/events_manager).
2. Si aun no existe: **Conectar orígenes de datos → Web → Crear**.
3. **`META_PIXEL_ID`**: es el numero largo que aparece bajo el nombre del
   conjunto de datos.
4. **`META_ACCESS_TOKEN`**: dentro del conjunto de datos, **Configuración →
   Conversions API → Generar token de acceso**. Copialo en cuanto aparezca,
   solo se muestra una vez. Es secreto: da permiso de escribir eventos en tu
   Pixel, nunca lo pongas en el HTML ni lo compartas.
5. **Verifica el dominio**: **Configuración del negocio → Seguridad de la
   marca → Dominios**. Sin dominio verificado, Meta limita a ocho los eventos
   que puedes usar y la optimizacion pierde precision.
6. En **Administrador de eventos → Configuración de eventos web**, ordena tus
   eventos por prioridad. Para esta campana el orden natural es:
   `Purchase → Lead → Contact → CompleteRegistration → ViewContent → PageView`.

### Comprobar que si esta midiendo

1. En **Administrador de eventos → Probar eventos**, copia el codigo `TESTxxxxx`
   y ponlo en Railway como `META_TEST_EVENT_CODE`.
2. Entra a `/admin → Meta Ads` y pulsa **Mandar evento de prueba**. Debe
   aparecer en la pantalla de Probar eventos en segundos.
3. Abre la landing, manda el formulario y confirma que aparece `Lead` **una
   sola vez**, con la etiqueta de que llego por navegador y por servidor. Si
   aparece dos veces, la deduplicacion se rompio.
4. **Borra `META_TEST_EVENT_CODE` antes de encender los anuncios.** Mientras
   este puesto, los eventos no cuentan para la campana.

La pestana **Meta Ads** del panel muestra en todo momento si el Pixel y la
Conversions API estan configurados, cuantos eventos salieron en las ultimas 24
horas y cuales fallaron. Sirve para detectar a tiempo el problema mas comun: el
token de la Conversions API se invalida al cambiar la contrasena de Facebook, y
sin este tablero solo se nota cuando la campana lleva dias reportando de menos.

## 4. Configurar los anuncios en Meta

- **Objetivo de la campana**: *Clientes potenciales* (Leads).
- **Evento de conversion**: `Lead`. Cambia a `Purchase` solo cuando tengas al
  menos 50 compras por semana; antes de eso el algoritmo no tiene con que
  aprender.
- **URL del anuncio**: agrega los parametros de origen para saber que anuncio
  trajo cada lead. Meta los rellena solo:

  ```
  https://www.levent.mx/?utm_source=meta&utm_medium=paid&utm_campaign={{campaign.name}}&utm_content={{ad.name}}
  ```

  Esos valores quedan guardados con cada lead y se ven en `/admin → Leads`
  ("Vino de: campana · anuncio"), y en el CSV. Es lo que permite decidir que
  anuncio apagar.
- **Conversion personalizada** (opcional, como respaldo): crea una que se
  active cuando la URL contenga `/gracias`. Asi la campana sigue midiendo
  aunque el Pixel de eventos falle.

## 5. Cobrar en linea (Mercado Pago)

1. Crea una aplicacion **Checkout Pro** en
   [mercadopago.com.mx/developers/panel](https://www.mercadopago.com.mx/developers/panel).
2. Pon el **Access Token** en `MP_ACCESS_TOKEN`. Empieza con las credenciales
   de prueba y `MP_SANDBOX=true`; cambia a las de produccion cuando vayas a
   cobrar de verdad.
3. En `/admin → Oferta`, ponle precio a la oferta. Con precio mayor a 0 el
   boton cobra; con 0, el boton lleva al formulario (util para servicios que
   se cotizan).

El `Purchase` se manda a Meta desde el webhook de Mercado Pago, no desde el
navegador: es la unica forma de estar seguro de que el cobro se aprobo. El
pedido lleva una bandera para que los reintentos del webhook no reporten la
misma venta varias veces e inflen el ROAS.

## 6. Aviso de leads por correo (opcional)

Crea una cuenta en [resend.com](https://resend.com), genera una API key y
agrega `RESEND_API_KEY` y `LEADS_EMAIL_TO` (a donde llegan los avisos). Sin
esto todo funciona igual, solo que los leads hay que revisarlos entrando al
panel.

## 7. Usar el panel

`https://<tu-dominio>/admin` con la contrasena de `ADMIN_PASSWORD`.

- **Leads** — cada persona que dejo sus datos, de que campana y anuncio vino,
  boton directo a su WhatsApp, marcar como atendido y exportar todo a CSV (ese
  CSV es el que se sube a Meta para crear publicos similares).
- **Contenido** — todos los textos de la landing y la imagen principal.
- **Oferta** — que se vende, precio, vinetas y texto del boton.
- **Ventas** — pedidos de Mercado Pago con su estado.
- **Meta Ads** — diagnostico de la medicion.

## 8. Privacidad

Se guardan nombre, telefono, correo y el origen de campana de cada persona que
llena el formulario. El aviso de privacidad se edita en `/admin → Contenido` y
esta enlazado bajo el boton de envio: revisalo con quien corresponda antes de
encender los anuncios, porque el texto que trae de fabrica es solo un punto de
partida.
