# Campañas de talleres · inventario de contenedores

Cuenta de anuncios **75151654** · Página **605291926236098** · WhatsApp **+52 1 56 6527 1901**

## La regla

**Cada taller tiene UN contenedor permanente. No se borra, no se comparte, no se
recicla para otro taller.** Cuando el taller no tiene fecha próxima se pausa;
cuando vuelve a programarse se reactiva el mismo, se le cambia la fecha en el
nombre y en el copy, y se le pone presupuesto.

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

## Inventario · campaña `52507070274991` (WhatsApp)

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
| LIVES · Habla hispana | 52515356214591 | $150/día, sin anuncios vivos |
| NOV26 · TALLERES · Landing | 52519080612791 | PAUSADA (7 registros en 2 días) |
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
