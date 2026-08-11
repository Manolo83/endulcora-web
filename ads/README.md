# Campañas de Meta Ads

Aquí vive el código que crea las campañas de Facebook/Instagram sin entrar al
Administrador de Anuncios a llenar formularios uno por uno.

La estructura que usa es la que ya funciona en **Endulcora** (el machote):

```
1 oferta  ->  1 campaña  ->  1 conjunto de anuncios  ->  1 creativo  ->  1 anuncio
```

- Objetivo **Interacción** (`OUTCOME_ENGAGEMENT`), optimizado a **conversaciones**.
- Destino **WhatsApp**, con botón "Enviar mensaje de WhatsApp".
- Presupuesto **en el conjunto** (no en la campaña), diario.
- Público por **radio alrededor de la sede** (no por intereses), con el rango
  de edad respetado de verdad (`advantage_audience: 0`).
- El anuncio se apaga solo la víspera del evento (`fechaEvento`).

**Instituto Justo** usa exactamente el mismo motor: lo único distinto es su
archivo de configuración.

## Archivos

| Archivo | Qué hace |
|---|---|
| `publicar.js` | El comando. Lee una cuenta, muestra el plan y (con `--publicar`) lo crea. |
| `lib/plantilla.js` | El machote: convierte una oferta en campaña + conjunto + creativo + anuncio. |
| `lib/meta-api.js` | Cliente de la Marketing API (subir imagen, crear objetos). |
| `cuentas/endulcora.js` | Config de Endulcora: 2 sedes, talleres, $150/día. |
| `cuentas/instituto-justo.js` | Config de Instituto Justo: Coyoacán, 3 ofertas. |
| `creativos/<cuenta>/` | Las imágenes de los anuncios (1080×1080 o 1080×1350). |
| `salidas/` | Los IDs de lo que se creó, por si hay que borrarlo o revisarlo. |

> ¿Primera vez? Sigue [`PASO-A-PASO.md`](PASO-A-PASO.md), que va desde cero.

## Antes de la primera vez

1. En `.env`, agrega el token de Meta:

   ```
   META_ACCESS_TOKEN=EAAG...
   ```

   Se saca en [developers.facebook.com](https://developers.facebook.com) →
   Herramientas → Explorador de la API de Graph, con permisos
   `ads_management`, `business_management` y `pages_show_list`, eligiendo el
   negocio correcto. Un token de usuario dura poco; para dejarlo fijo conviene
   generar uno de larga duración o de system user.

2. Para Instituto Justo, agrega también el WhatsApp al que deben llegar los
   mensajes (con lada de país, sin espacios):

   ```
   JUSTO_WHATSAPP=525512345678
   ```

   Si todavía no hay WhatsApp de negocio, abre
   `cuentas/instituto-justo.js` y cambia `destino: 'whatsapp'` por
   `destino: 'messenger'`; los mensajes llegarán al inbox de la página, como
   en las campañas de julio.

3. Pon las imágenes en `creativos/instituto-justo/` con los nombres que pide la
   config: `regularizacion.jpg`, `matematicas.jpg`, `admision.jpg`.

## Uso

Revisar sin tocar nada (esto **no** gasta ni crea nada):

```bash
node ads/publicar.js instituto-justo
```

Crearlas en Meta, **en pausa**, para revisarlas en el Administrador antes de
que empiecen a gastar:

```bash
node ads/publicar.js instituto-justo --publicar
```

Crearlas ya activas:

```bash
node ads/publicar.js instituto-justo --publicar --activar
```

Solo algunas ofertas:

```bash
node ads/publicar.js instituto-justo --publicar --solo=regularizacion
```

Y lo mismo para Endulcora:

```bash
node ads/publicar.js endulcora
```

## Agregar una oferta nueva

En el archivo de la cuenta, agrega un objeto a `ofertas`:

```js
{
  clave: 'algebra-verano',
  nombre: 'Álgebra Intensivo',
  empiezaEl: '2026-09-01',
  fechaEvento: '2026-09-20',        // o terminaEl: '2026-09-20'
  publico: { edadMin: 30, edadMax: 55, generos: [2] },  // [1] hombres, [2] mujeres
  presupuestoDiarioCentavos: 15000,  // $150 al día
  creativo: {
    imagen: 'algebra.jpg',
    encabezado: 'Álgebra desde cero',
    texto: 'Primera línea que engancha.\n\nQué se lleva.\n\nCómo escribir.',
  },
}
```

Si la cuenta tiene varias sedes y esta oferta solo va en una, agrégale
`sedes: ['coyoacan']`.

## Notas

- Todo se crea en **pausa** salvo que pases `--activar`. Meta además revisa
  cada anuncio antes de entregarlo.
- Los presupuestos van en **centavos** (`20000` = $200 MXN).
- El script no borra ni modifica campañas existentes: solo crea. Para apagar
  algo, hazlo desde el Administrador de Anuncios.
- Cada corrida deja un JSON en `salidas/` con los IDs creados.
