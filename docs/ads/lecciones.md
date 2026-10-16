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
