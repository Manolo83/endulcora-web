# Paso a paso: dejar listas las campañas de Instituto Justo

Hay dos caminos. **El camino A no requiere que instales nada** y es el que
recomiendo para dejarlo listo hoy. El camino B es para cuando quieras
relanzar campañas tú solo, sin pedírmelo.

---

## Camino A — Dejarlo listo hoy (recomendado)

Solo necesitas darme dos datos y yo creo las campañas en pausa.

### Paso 1 · Decide a dónde llegan los mensajes

| Opción | Qué necesito | Cómo se ve |
|---|---|---|
| **WhatsApp** (como Endulcora) | El número con lada: `52` + 10 dígitos, ej. `525512345678` | Botón "Enviar mensaje de WhatsApp", abre el chat directo |
| **Messenger** (como en julio) | Nada, ya está | Botón "Enviar mensaje", llega al inbox de la página |

WhatsApp convierte mejor y es lo que hace que funcione en Endulcora. Si el
instituto no tiene un número dedicado, sirve un celular normal con WhatsApp
instalado — pero que alguien lo conteste rápido, porque el anuncio se optimiza
según quién responde.

### Paso 2 · Decide las imágenes

Ya hay imágenes subidas en la cuenta que puedo reutilizar tal cual (las del
set de Canva y la del curso de matemáticas). Con eso las campañas salen hoy.

Si prefieres imágenes nuevas: 3 archivos cuadrados de **1080 × 1080 px**, JPG
o PNG, con poco texto encima (Meta castiga la entrega de imágenes muy
saturadas de letras). Súbelas a `ads/creativos/instituto-justo/` con estos
nombres exactos:

```
regularizacion.jpg
matematicas.jpg
admision.jpg
```

### Paso 3 · Revisa el plan

Estas son las 3 campañas que quedarían. Dime si algo cambia:

| Campaña | Público | Radio | Presupuesto | Corre |
|---|---|---|---|---|
| Regularización | Mujeres 30-55 | 5 km de Coyoacán | $200/día | 11 ago → 30 sep |
| Clases de Matemáticas | Todos 18-45 | 5 km de Coyoacán | $150/día | 11 ago → sin fin |
| Examen de Admisión | Mujeres 35-55 | 5 km de Coyoacán | $150/día | 11 ago → 30 nov |

Total: **$500 MXN al día** si se activan las tres.

Si quieres empezar más barato, lo normal es arrancar solo con Regularización
(es la temporada) a $200/día y ver el costo por conversación una semana antes
de prender las otras.

### Paso 4 · Yo las creo, tú las revisas

Las creo **en pausa**. Entras a
[Administrador de Anuncios](https://adsmanager.facebook.com), revisas que el
texto y la imagen se vean bien en la vista previa, y le das play tú.

### Paso 5 · Qué mirar los primeros días

- **Costo por conversación**: si a los 3 días está arriba de ~$60 MXN, algo no
  está jalando (normalmente la imagen o el radio).
- **Frecuencia**: si pasa de 3 en una semana, el público de 5 km ya se saturó;
  ahí conviene ampliar a 8 km.
- **Responder rápido**: Meta mide si las conversaciones se contestan. Un chat
  sin responder encarece todo lo demás.

---

## Camino B — Correrlo tú mismo desde tu computadora

Esto sirve para el mes que entra, cuando quieras lanzar campañas nuevas sin
esperar a nadie.

### B1 · Instala Node.js

Descarga la versión LTS de [nodejs.org](https://nodejs.org) e instálala
(siguiente, siguiente, siguiente). Para comprobar, abre la Terminal
(Mac: `Cmd+Espacio` → "Terminal") y escribe:

```bash
node -v
```

Debe responder algo como `v20.x` o `v22.x`.

### B2 · Baja el proyecto

```bash
git clone https://github.com/Manolo83/endulcora-web
cd endulcora-web
npm install
```

### B3 · Consigue el token de Meta

1. Entra a [developers.facebook.com](https://developers.facebook.com) con la
   cuenta que administra el negocio.
2. **Mis apps → Crear app**. Tipo: **Otro** → **Empresa**. Nómbrala
   "Instituto Justo Ads" y vincúlala al negocio.
3. Dentro de la app: **Herramientas → Explorador de la API de Graph**.
4. Arriba a la derecha elige tu app, luego **Generar token de acceso** y marca
   estos permisos:
   - `ads_management`
   - `business_management`
   - `pages_show_list`
   - `pages_read_engagement`
   - `instagram_basic` (solo si quieres entrega en Instagram)
5. Copia el token que sale.
6. Ese token dura ~2 horas. Para que dure 60 días: **Herramientas → Depurador
   de tokens de acceso**, pega el token, y abajo **Extender token de acceso**.

> Para que nunca caduque hay que crear un *usuario del sistema* en
> business.facebook.com → Configuración del negocio → Usuarios → Usuarios del
> sistema. Es lo correcto a largo plazo, pero para empezar el de 60 días basta.

### B4 · Crea el archivo `.env`

En la carpeta del proyecto, copia `.env.example` a `.env` y llena solo estas
líneas:

```
META_ACCESS_TOKEN=EAAG...el token largo que copiaste...
JUSTO_WHATSAPP=525512345678
```

### B5 · Revisa en seco

```bash
node ads/publicar.js instituto-justo
```

Esto **no crea ni gasta nada**. Imprime las 3 campañas con su público,
presupuesto y fechas, y te avisa si falta algo (por ejemplo una imagen).

Si te dice que falta una imagen y no quieres hacerla ahora, abre
`ads/cuentas/instituto-justo.js` y quita las dos barras `//` de la línea
`imageHash:` de esa oferta — así usa una imagen que ya está en la cuenta.

### B6 · Publícalas en pausa

```bash
node ads/publicar.js instituto-justo --publicar
```

Cuando termina, imprime los IDs de todo lo creado y los guarda en
`ads/salidas/`.

### B7 · Actívalas

Desde el Administrador de Anuncios, o de un jalón:

```bash
node ads/publicar.js instituto-justo --publicar --activar
```

(Ojo: `--activar` las prende de inmediato, sin que las revises antes.)

---

## Preguntas frecuentes

**¿Se puede correr desde Railway?**
No hace falta. El script es una herramienta que se corre a mano cuando quieres
lanzar campañas; no es parte del sitio web ni necesita estar desplegado.

**¿Y si me equivoco y creo campañas de más?**
Todo nace en pausa, así que no gastan. Se borran desde el Administrador de
Anuncios sin problema. El script nunca modifica ni borra campañas existentes:
solo crea.

**¿Puedo lanzar un curso nuevo?**
Sí. Agrega una oferta más en `ads/cuentas/instituto-justo.js` (está explicado
al final de [`README.md`](README.md)) y vuelve a correr el comando con
`--solo=clave-de-tu-oferta` para que solo cree esa.

**¿Esto sirve para Endulcora también?**
Sí, es el mismo motor: `node ads/publicar.js endulcora`.
