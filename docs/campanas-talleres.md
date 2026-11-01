# Campañas de talleres · inventario de contenedores

Cuenta de anuncios **75151654** · Página **605291926236098** · WhatsApp **+52 1 56 6527 1901**

## La regla (acordada con Manolo el 31 de octubre de 2026)

**Una CAMPAÑA por taller. Un conjunto. Un anuncio. Nunca otro taller adentro.**

Cuando el taller no tiene fecha próxima se pausa; cuando vuelve a programarse se
reactiva la misma campaña, se le cambia la fecha en el nombre y en el copy, y se
le pone presupuesto. **No se borra nunca.**

Si se quiere separar por horario: **dos conjuntos dentro de la misma campaña del
mismo taller**, cada uno con su presupuesto. Dos anuncios en un mismo conjunto no
sirve — Meta le da casi todo a uno y el otro se queda con migajas (pasó con el
arte "D Manos", que recibió el 7% del gasto teniendo mejor CTR).

## El número de WhatsApp

**El número de ventas es 5575933916.** Es el original y al que siempre llegaron
las campañas. Toda la estructura apunta ahí.

El **5665271901 NO es el número de ventas.** Estuvo conectado a la página por
error y se quitó el 31 de octubre de 2026. Aun así viene impreso en la banda
inferior de todos los artes de taller de octubre y noviembre
("WHATSAPP 5665271901 · Escribe la palabra ..."), así que **los artes hay que
rehacerlos con el 5575933916**. Quien le pica al botón llega bien; quien lee el
arte y teclea el número a mano, no.

El destino no se puede leer desde la API de anuncios: los conjuntos solo
guardan `page_id` 605291926236098 y el número vive en la cuenta de WhatsApp
conectada a la página, en Business Suite. **Nunca darlo por verificado sin
verlo**: el 30 de octubre se registró aquí como verificado basándose en lo que
dijo otra persona, y era falso.

### Por qué

En octubre de 2026 se metieron anuncios de talleres nuevos dentro de
contenedores de otros talleres, porque se creyó que "no había contenedores
libres". No es cierto: se pueden crear los que hagan falta.

El daño fue real y medible. El anuncio de Pays y Tartas corría dentro del
conjunto de Aguas Michoacanas; el de Mesa de Postres Halloween dentro del de
Tablas de Charcutería; el de Roles Gourmet dentro del de Carnitas. Meta llevaba
semanas aprendiendo quién compra un producto y se le empezó a enseñar otro.

Esos anuncios reciclados se crearon el 5, 11, 14 y 20 de octubre. La campaña se
desplomó la semana del 9 al 15 de octubre: de 756 conversaciones a 422, y el
costo por conversación de $13.39 a $23.57.

**Tablas de Charcutería conservó su contenedor original todo el tiempo y llegó a
$7.92 por conversación — el mejor número de la cuenta.**

### Duplicar no hereda el aprendizaje

`ads_create_ad_set` acepta `source_adset_id` y copia la configuración, pero el
contenedor nuevo nace con historial en cero. Crear nunca modifica lo que ya
existe, así que duplicar es seguro — pero si el taller ya tiene contenedor con
historia, se usa ese, no una copia.

Al reutilizar, **se conserva el mismo `creative_id`**: así el anuncio mantiene
sus likes y comentarios en vez de salir en blanco.

### Dos trampas ya vividas

1. **Pausar una campaña NO pausa sus conjuntos.** Quedan en `status: ACTIVE` por
   dentro y reviven todos juntos al reactivar la campaña. El 30 de octubre
   revivieron siete conjuntos viejos, con talleres ya vencidos. Se apaga
   conjunto por conjunto, y se audita con `status`, nunca con `effective_status`.
2. **Cambiar el presupuesto fuerza PAUSED.** Siempre hay que reactivar después.

## Las 8 campañas por taller · creadas el 31 de octubre

$110/día cada una. Nacieron en fase de aprendizaje: los primeros dos días gastan
poco y errático, se estabilizan el 2 de noviembre. No juzgarlas antes.

| Campaña | id |
|---|---|
| TALLER · Tablas de Charcutería · Nativitas · 7 nov | 52519307506391 |
| TALLER · Aguas Michoacanas · Nativitas · 6 o 8 nov | 52519307507791 |
| TALLER · Velas Comestibles · Nativitas · 6 o 8 nov | 52519307508791 |
| TALLER · Cheesecakes Horneados · Nativitas · 5 o 7 nov | 52519307511391 |
| TALLER · Chocolatería Básica · Nativitas · 5 o 7 nov | 52519307513391 |
| TALLER · Galletas NY · División del Norte · 5 o 7 nov | 52519307514191 |
| TALLER · Tiramisú Douyin · División del Norte · 6 o 8 nov | 52519307515191 |
| TALLER · Carnitas · Nativitas · 8 nov | 52519307517591 |

Cada una se armó con `source_adset_id` apuntando al conjunto viejo del mismo
taller (copia la configuración exacta) y reutilizando su mismo `creative_id`
(conserva likes y comentarios del anuncio).

## Regla de corte

| Cuándo | Qué se mira | Qué se hace |
|---|---|---|
| Días 1–3 | nada | No se toca. Está aprendiendo. |
| Día 4 | costo por conversación | Si pasa de $40, se baja el presupuesto a la mitad |
| Día 6 | costo **e** inscritos | Si sigue arriba de $40 **o** va en 0 inscritos, se apaga |
| Siempre | — | Lo liberado se le pasa al que mejor va |

**Nunca cortar sin repartir.** Cortar sin repartir le tumbó las ventas la semana
del 12 al 18 de octubre: de 756 conversaciones a 422.

Cada taller se apaga en cuanto pasa su fecha.

## El clic barato no llena salones

| Taller | Costo por conversación | Inscritos que llenó |
|---|---|---|
| Tablas de Charcutería | **$7.92** (el más barato) | **5** |
| Velas Comestibles | **$18.10** (caro) | **17 a 19** |

Para decidir **qué programar** se usa el costo por **inscrito**, de la bitácora
`Inscritos 2026` del Drive. Para decidir **qué apagar** dentro de la semana se
usan conversaciones, porque es lo único que se mueve rápido.

## Inventario · campaña `52507070274991` (WhatsApp)

Estos 8 conjuntos quedaron PAUSADOS el 31 de octubre al pasar a campañas
individuales. **No se borran**: aquí vive el historial de cada taller, y es la
referencia para saber cuánto costaba cada uno.

Acumulado desde el 7 de septiembre de 2026. Ordenado por costo por conversación.

| Taller | Sede | adset_id | Gasto | Conv. | Costo |
|---|---|---|---|---|---|
| Tablas de Charcutería | Nativitas | 52507570676791 | $4,245 | 536 | **$7.92** |
| Galletas NY | División | 52507570825191 | $2,389 | 188 | $12.71 |
| Mesa de Postres Halloween | División | 52507572060391 | $2,340 | 189 | $12.38 |
| Aguas Michoacanas | Nativitas | 52507570778991 | $5,615 | 434 | $12.94 |
| Cheesecakes Horneados | Nativitas | 52507585552991 | $3,524 | 238 | $14.81 |
| Banderillas Coreanas | Nativitas | 52507571250191 | $4,966 | 326 | $15.23 |
| Sushi para Principiantes | Nativitas | 52507571974991 | $1,036 | 67 | $15.47 |
| Chocolatería Básica | Nativitas | 52507585057791 | $3,219 | 205 | $15.71 |
| Tiramisú Douyin | División | 52507571375191 | $1,801 | 114 | $15.80 |
| Postres en Vaso | Nativitas | 52507570393791 | $1,331 | 84 | $15.86 |
| Conchas Gourmet | Nativitas | 52507571403591 | $2,733 | 171 | $15.98 |
| Repostería Otoñal | División | 52507244353591 | $3,978 | 248 | $16.04 |
| Calaveras | División | 52507571297791 | $5,556 | 330 | $16.84 |
| Barbacoa Tradicional | Nativitas | 52507585024191 | $740 | 43 | $17.22 |
| Velas Comestibles | Nativitas | 52507244252791 | $4,236 | 234 | $18.10 |
| Pan de Muerto Masa Madre | Nativitas | 52507570723191 | $2,510 | 138 | $18.19 |
| Carnitas | Nativitas | 52507571214191 | $4,594 | 230 | $19.98 |
| Empanadas Argentinas | Nativitas | 52507571338791 | $3,738 | 176 | $21.24 |
| Repostería Canina y Felina | División | 52507244286791 | $1,194 | 52 | $22.97 |
| Pan de Muerto Tradicional | temporada | 52507572123191 | $4,057 | 162 | $25.05 |

Duplicados creados el 30 de octubre para comparar contenedor nuevo contra
reciclado, hoy PAUSADOS porque los originales (con historia) rindieron mejor:
`52519290413191` Tablas · `52519290419191` Velas · `52519290435791` Aguas.

No reactivar: `52507570495391` RETARGETING Compradores (se saturó, frecuencia
4.06) · `52507072486591` MODELO (plantilla vacía).

## Otras campañas

| Campaña | id | Estado |
|---|---|---|
| MASTERCLASS Galleta NY · 9 nov | 52518778847591 | ACTIVA · $450/día |
| LIVES · Habla hispana | 52515356214591 | PAUSADA · reactivar si sube arte nuevo |
| NOV26 · TALLERES · Landing | 52519080612791 | PAUSADA · 7 registros en 2 días a ~$46 |
| NOV26 · TALLERES · Compra en sitio | 52517625303391 | PAUSADA |
| CLASE GRATIS · Pan de Muerto | 52514704981591 | PAUSADA (cerró en 482 a $1.05) |
| VELAS \| VENTAS \| FRIO (ebook) | 52502843672191 | PAUSADA · NO TOCAR |
| ENTEAMIGOS | 52518830484991 | De Manolo, aparte. NO TOCAR, NO CONTAR |

## Talleres que nunca llenan

De la bitácora `Inscritos 2026` del Drive. Programarlos es fabricar
cancelaciones:

**Moles** (0, 0, 0) · **Chiles en nogada División** (0, 0, 0) ·
**Pastelería mexicana** (0, 0) · **Galletas decoradas** (0, 0, 1, 0)

Los que siempre llenan: **Velas** (17, 19, 10, 8) · **Palomitas** (14, 15, 8) ·
**Tiramisú** (12) · **Paellas** (10) · **Pastelería básica** (9).

## Presupuesto

Techo **$10,000/semana ($1,428/día)**, duro. Se compara el promedio de 7 días;
Meta puede gastar hasta 35% de más un día suelto.

Al 31 de octubre: talleres $880 (8 × $110) + masterclass $450 = **$1,330/día**.

## Ubicaciones: qué sirve y qué no

Medido sobre la campaña `TALLERES · Tasqueña 12km` (52507070274991):
**$65,054 gastados, 4,227 conversaciones de WhatsApp.** Es la única muestra
del histórico lo bastante grande para decidir. No usar los datos de una
campaña nueva para esto: con 40 conversaciones no se concluye nada.

| Plataforma | Gasto | Conversaciones | Costo |
|---|---|---|---|
| Facebook | $46,599 | 3,342 | **$13.94** |
| Estados de WhatsApp | $2,333 | 151 | $15.45 |
| Instagram | $15,699 | 716 | **$21.93** |
| Audience Network | $423 | 18 | $23.50 |

Instagram cuesta **57% más** que Facebook. Se llevó el 24% del dinero y
entregó el 17% de las conversaciones: ese dinero en Facebook habría dado
1,126 conversaciones en vez de 716. **410 conversaciones perdidas.**

Por ubicación, dentro de Facebook:

Búsqueda $5.89 (89) · In-stream $8.04 (28) · **Reels $10.48 (868)** ·
Marketplace $10.09 (18) · Profile feed $13.72 (13) · Stories $14.15 (174) ·
**Feed $15.96 (2,087)** · Notificaciones $31.91 gastados, **0 conversaciones**.

Lo caro: Instagram feed $24.04 (377) · Instagram reels $19.19 (206) ·
Instagram stories $20.18 (133).

**Reels de Facebook es más barato que el Feed** ($10.48 vs $15.96) con 868
conversaciones de respaldo. Meta por su cuenta mete la mitad del dinero al
Feed y casi nada a Reels.

### Configuración aplicada el 31 oct a los 8 conjuntos

```
publisher_platforms: facebook, instagram, whatsapp
facebook_positions:  feed, instream_video, marketplace, story, search,
                     facebook_reels, facebook_reels_overlay, profile_feed
instagram_positions: story          <- SOLO historias
whatsapp_positions:  status
device_platforms:    mobile, desktop
targeting_automation: advantage_audience = 1   <- nunca ponerlo en 0
```

Fuera: Instagram feed, Instagram reels, Instagram explore, Audience Network,
Threads y notificaciones de Facebook.

**Meta no deja quitar Instagram del todo.** Si se piden Estados de WhatsApp
sin Historias de Instagram, rechaza con:
`Instagram Stories required for WhatsApp Status`. Por eso quedan las
historias de Instagram: son el peaje para conservar Estados de WhatsApp.

Tras el cambio los 8 anuncios entran en revisión (`PENDING_REVIEW` /
`IN_PROCESS`) y el conjunto puede aparecer un rato como `no_active_ad`.
Es transitorio mientras se propaga, no es que se hayan apagado: lo que
hay que mirar es el `status` del anuncio, que sigue en `ACTIVE`.

## Destino del mensaje: WhatsApp vs automático

**No hay datos en esta cuenta.** Todo el histórico es destino WhatsApp, así
que no se puede comparar contra automático. No inventar una opinión aquí.

Lo único que sí se sabe: el tráfico de Instagram convierte 57% más caro, y
automático manda parte de las conversaciones a Instagram Direct y Messenger.
Antes de probarlo hay que contestar una pregunta operativa: **¿alguien
contesta Messenger e Instagram Direct tan rápido como WhatsApp?** Si nadie
los lee, automático manda prospectos pagados a buzones muertos. Si sí,
se prueba en **una sola campaña** contra las otras siete.

## El número de WhatsApp no se puede leer desde la API

Confirmado el 31 oct leyendo el creative: `link_url` viene vacío y el
`call_to_action_type` es `WHATSAPP_MESSAGE`. El botón **resuelve el destino
en el momento del clic**, leyendo el WhatsApp conectado a la página.

Por lo tanto: **nunca afirmar a qué teléfono llegan los mensajes.** Ni que
está bien ni que está mal. El único que puede comprobarlo es Manolo,
picándole al botón desde su celular. Esta regla ya se rompió dos veces y
las dos costaron.

## Huecos de conversaciones: qué es normal

Con 8 talleres a $110/día el promedio es **1.7 conversaciones por hora**.
Una hora en blanco pasa sola el 18% de las veces; media hora, el 45%.
**Un hueco de una hora no prueba que algo esté roto.** Antes de tocar nada:
medir dos veces separadas y ver si el contador se movió. El 31 oct un hueco
de una hora se interpretó como falla y no lo era.

## Ojo: los 8 conjuntos apuntan al mismo lugar

Los 8 — Nativitas y División del Norte por igual — tienen la misma
ubicación: lat 19.3444, lon -99.1394, radio 25 km. **Los de División del
Norte no están segmentando su propia zona.** Pendiente de decidir con
Manolo si se separan.
