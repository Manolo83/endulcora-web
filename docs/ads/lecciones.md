# Lecciones de la cuenta de Endulcora

Errores que ya cometí. No repetirlos.

## 1. Un arte cargado se monta el mismo día

Cinco artes estuvieron tres días sin anuncio porque pedi contenedores nuevos
en vez de reusar los que yo mismo acababa de liberar. Si no hay contenedor
libre, se reusa el de un taller vencido o cancelado. Nunca esperar.

## 2. Verificar el arte renderizado antes de construir

Mis notas estuvieron mal dos veces. Pays y Tartas no era "23", era "23 o 25"
y en Nativitas, no en Division. Para ver un arte que no tiene anuncio: crear
un creative desechable con ese image_hash y previsualizarlo. El arte manda,
no mis notas ni ningun documento.

## 3. Registros no son asistentes y asistentes no son ventas

Celebre 200 registros de lives a $0.70 durante tres dias. Produjeron cero
asistentes nuevos: los 20-30 que entran ya eran de su comunidad. Antes de
llamar bueno a un numero, preguntar que pasa despues de ese numero.

## 4. No comparar un registro gratis con una venta de $1,149

Use el $1.12 de la clase gratis para argumentar que el sitio era 100 veces
mas barato que WhatsApp. Son cosas distintas: registrarse a algo gratis
siempre sera mas barato que soltar mil pesos. Comparacion invalida,
sostenida cuatro veces.

## 5. Temporada vende, catalogo no

Octubre: 12 de 16 talleres cancelados. Los que sobrevivieron son Pan de
Muerto y Calavera. El unico lleno (PDM gourmet 18, 10 personas) no tuvo ni
un peso de pauta. Palomitas tuvo el presupuesto mas grande de la cuenta,
107 conversaciones y cero inscritos. La pauta no salva un taller fuera de
temporada.

## 6. Revisar los publicos antes de culpar a los anuncios

Durante meses los once conjuntos apuntaron a "12 km de Tasqueña, 18-65" y
nada mas. Mientras tanto existia sin usarse un Lookalike 1% de clientes
reales (52504678530591, creado el 24 ago) y un publico de interaccion de
40,000 personas (52506809462991). La hipotesis de Manolo —que no le
llegamos a quien le interesa— era correcta y yo no habia mirado ahi.

## 7. Las conversaciones mienten

CTR de 3% a 6% y 475 conversaciones por semana no significan nada si no se
inscriben. El numero que importa es el registro en la hoja de Leslie.

## 8. Lo que NO es mio

- WhatsApp y el seguimiento: instruccion explicita de Manolo.
- El admin de endulcora.com, la base de datos y el envio de correos.
- Subir artes a Meta: la herramienta no esta disponible en esta cuenta.

## 9. Reusar un contenedor no apaga el anuncio viejo (15 oct)

Al reusar los conjuntos de Palomitas y Bebidas Otoñales para Pays y Tartas
y Roles Gourmet, cree los anuncios nuevos y crei haber pausado los viejos.
Pause IDs equivocados. Durante un dia completo cada contenedor corrio DOS
anuncios a la vez:

- Pays y Tartas gasto $35.75, pero $31.56 se fueron al arte de Palomitas.
- Roles Gourmet gasto $68.03, pero $41.22 se fueron al arte de Bebidas
  Otoñales.

Peor que el dinero: se anunciaron talleres que ya no existen, generando
conversaciones que nadie puede atender.

Y le reporte a Manolo "Pays y Tartas ya arranco" leyendo el gasto del
conjunto, no el del anuncio.

REGLA: despues de reusar un contenedor, listar los anuncios ACTIVOS por
conjunto y confirmar que hay exactamente UNO y que es el correcto. El gasto
a nivel conjunto no prueba que el arte correcto este corriendo. Verificar a
nivel anuncio, siempre.

### 9b. Anuncios dormidos (mismo dia)

Barriendo la cuenta encontre 8 anuncios mas con `status: ACTIVE` que no
entregaban solo porque su conjunto estaba pausado (`effective_status:
ADSET_PAUSED`). Entre ellos Tacos de Canasta, que acababa de cortar por
costo.

En el momento en que yo reuso ese contenedor y lo activo, ese anuncio
viejo se enciende SOLO. Asi nacieron los dos huerfanos de arriba.

REGLA: antes de activar un contenedor reusado, listar sus anuncios y
confirmar que cada anuncio viejo tiene `status: PAUSED`, no solo
`effective_status`. Los ocho quedaron pausados el 15 oct.

## 10. Verificar el arte renderizado ANTES de escribir el copy (15 oct)

Escribi el copy de Empanadas sin hora porque no la tenia en mis notas.
Al renderizar el anuncio, el arte decia "10:00 AM" y "TRES RELLENOS".
Tuve que rehacer el creative (son inmutables).

REGLA: renderizar primero, escribir el copy despues. El arte tiene datos
que las notas no tienen.

## 11. El radio de 12 km era la causa raiz (16 oct)

Manolo insistio: "esto funciono de diciembre a mayo" y "siento que ya no se
le esta entregando el anuncio a la gente". Tenia razon en lo segundo y yo
llevaba dias analizando la cosa equivocada.

Serie mensual de la cuenta:

| Mes | Gasto | Alcance | Impresiones | CPM | CTR |
|---|---|---|---|---|---|
| ene 2026 | $50,548 | 655,135 | 1,845,332 | $27.39 | 3.29% |
| feb 2026 | $44,214 | 283,658 | 1,270,993 | $34.79 | 3.52% |
| may 2026 | $44,011 | 166,276 | 799,136 | $55.07 | 3.30% |
| oct 2026 | ~$41,000 | ~230,000 | ~576,000 | $70.99 | 4.74% |

Tres hechos:
1. El CTR de hoy (4.74%) es el MEJOR del año. Los anuncios no son el problema.
2. El CPM se multiplico por 2.6 desde enero.
3. El alcance cayo 57% de enero a febrero y nunca volvio.

Mi primera hipotesis fue que el alcance de enero venia de campañas
nacionales de ebooks. Manolo la tumbo en una linea: en enero no habia
ebooks, solo talleres, y una sola sucursal.

Eso deja una sola explicacion posible: EL RADIO ERA MUCHO MAS ANCHO. Un
circulo de 12 km no puede alcanzar 655,000 personas al mes a frecuencia
2.8. No caben.

Accion (16 oct): los 12 conjuntos de talleres pasaron de radio 12 km a
25 km (de 452 km2 a 1,963 km2), se les quito la exclusion de clientes
propios, y a tres se les quito un Lookalike 1% de solo 1,000 personas que
los estaba estrangulando ($48 por conversacion, los mas caros de la cuenta).

REGLA: cuando el CTR esta sano y las conversaciones caen, el problema no
es el anuncio — es a cuanta gente se le entrega. Mirar alcance, CPM e
impresiones ANTES de tocar creatividades o presupuestos.

REGLA 2: comparar siempre contra el historico de la cuenta, no solo contra
la semana pasada. La semana pasada tambien estaba rota.

---

## Leccion 12 — Un conjunto con fecha de fin vencida dice ACTIVE y no entrega nada

18 oct. Al intentar colgar los cuatro anuncios de los lives (19–22 oct) en el
conjunto `LIVES · Habla hispana` (52515358023591), Meta rechazo la creacion:

    "Ad set has ended: Ad set 52515358023591 expired on Oct 15, 2026."

El conjunto se leia asi:

    status:           ACTIVE
    effective_status: ACTIVE
    end_time:         2026-10-15T18:00:00-0700
    amount_spent:     $368.30

Es decir: ACTIVE en los dos campos, y muerto desde el 15 de octubre a las
6 PM. Tres dias enteros sin entregar una sola impresion, sin ninguna señal
en los campos que yo venia revisando. Esto explica el anuncio de Brownies
que llevaba 5 reportes en $0 y que yo seguia preguntando en vez de
diagnosticar: no era que no gastara, era que el contenedor ya habia
terminado su calendario.

REGLA: `status` y `effective_status` NO detectan un calendario vencido.
Para cualquier conjunto o campaña con `end_time` / `stop_time` puesto, hay
que leer esa fecha y compararla contra hoy. Un conjunto vencido acepta
renombrar y cambiar presupuesto sin protestar, pero rechaza anuncios nuevos
y no gasta un peso.

REGLA 2: si un anuncio lleva varios dias en $0, no se pregunta — se revisa
el `end_time` del conjunto y del campaign ANTES de cualquier otra hipotesis.
Que yo preguntara cinco veces por el de Brownies en vez de mirar la fecha
fue el error; la respuesta estaba en un campo que nunca pedi.

REGLA 3: los conjuntos de talleres no llevan `end_time` y por eso nunca
dieron este problema. Los lives si lo llevan porque son fechas fijas.
Cada vez que se agregue un live nuevo hay que extender el `end_time` del
conjunto hasta la hora del ultimo live, o el anuncio ni siquiera se puede
crear.

Corregido el 18 oct: `end_time` movido a 2026-10-22T18:00:00-0700 (hora de
inicio del ultimo live, Pastel Bruce). La campaña 52515356214591 se
renombro de "LIVES · Registros en sitio · Semana 12–15 oct" a
"LIVES · Registros en sitio" para que el nombre no vuelva a caducar.

---

## Leccion 13 — No repetir de memoria un dato que puedo leer

En la misma sesion yo traia anotado que `Reposteria Otoñal` (52507244353591)
gastaba $0 con $30 diarios, y sobre eso arme un plan para pausarla y liberar
presupuesto para los lives. Antes de ejecutarlo lo lei: habia gastado
$567.25 en 7 dias. Pausarla habria cortado un taller que si estaba
vendiendo (29 o 31 oct).

REGLA: ningun numero que venga de mi memoria o de un resumen anterior se
usa para decidir un corte. Se vuelve a leer de la cuenta en el momento. Los
numeros envejecen en horas.

---

## Leccion 14 — La cuenta corre en hora de Los Angeles, no de CDMX

Durante dos dias lei mal los cortes de dia: pedi "hoy" a media mañana de
CDMX y me salieron numeros minusculos, y asumi que el dia apenas
arrancaba. Llegue a decirle a Manolo que las 300 visitas del experimento
de sitio caian "mañana" cuando en realidad faltaban cinco dias.

Lo verifique leyendo `timezone_name` a nivel cuenta:

    America/Los_Angeles

O sea una hora ATRAS de Ciudad de Mexico. Consecuencias practicas:

- El dia de la cuenta cierra a la 1:00 AM hora CDMX, no a medianoche.
- Lo que pasa entre medianoche y la 1 AM en CDMX cuenta para el dia
  ANTERIOR en los reportes.
- `date_preset: today` a las 9 AM de CDMX trae solo 8 horas de dia, y
  esas son las horas de menos trafico. No se juzga nada con eso.
- Un `end_time` que diga `-0700` esta en hora de la cuenta, no de CDMX.

REGLA: antes de comparar dias o de proyectar un ritmo, confirmar en que
huso corre la cuenta. Y nunca extrapolar un ritmo diario desde una lectura
de `today`: se usa `yesterday` (dia completo) o `last_7d`.
