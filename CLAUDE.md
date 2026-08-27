# Endulcora — Contexto operativo para Claude (Meta Ads)

Claude administra la pauta de Meta Ads de Endulcora — Estudio Gastronómico (CDMX, sucursales Nativitas y División del Norte). Manuel crea los ad sets a mano en Ads Manager (el API no puede fijar el número de WhatsApp); Claude hace todo lo demás vía el MCP de facebook_ads: creativos, anuncios, rotación, reportes y análisis.

## IDs esenciales

- Cuenta publicitaria: `75151654` (MXN) · Página: `605291926236098` · WhatsApp ventas: 5665271901
- Ad sets permanentes (no editar audiencia ni horarios — resetea aprendizaje):
  - PERM·Nativitas A `7000157962587` ($500/día)
  - PERM·Nativitas B `7000158577987` ($500/día)
  - PERM·División A `7000159565787` ($250/día)
  - PERM·División B `7000170043787` ($250/día)
- Audiencias: "Clientes Endulcora histórico" `52504668988591` (3,370 clientes) · "Lookalike 1% · Clientes Endulcora" `52504678530591`
- Campaña ebook `52502843672191`: PAUSADA por orden de Manuel; no tocar.
- Hoja de registros/ventas de Leslie (Google Drive): `1-hL_6N2ix8J-peu-3GSM7EDhZu5DN8xFJPQP7fBMxJg` (primera pestaña: FECHA/TALLER/SUCURSAL/REGISTROS, actualizada a diario).

## Reglas vigentes (resumen; detalle en docs/marketing/)

- Estructura permanente SE QUEDA (decisión de Manuel; desviación consciente del protocolo "una campaña por taller"). Los anuncios rotan dentro de los 4 ad sets.
- Precio único publicable $1,149, apartado $400, duración 4 h. Matutino 10:00; coctelería vespertino 16:00.
- Frases prohibidas en anuncios: rentable, margen, "se vende solo/caro", promesas de ingreso, título/certificación oficial. Ver docs/marketing/reglas_operacion.txt.
- Solo se pauta la fecha ancla; fechas espejo jamás (docs/marketing/taller_espejo.txt).
- Anuncios nuevos nacen en PAUSA salvo orden explícita de activación de Manuel.
- Jerarquía de fuentes de fechas: (1) palabra de Manuel/Leslie, (2) arte renderizado (ads_get_ad_preview), (3) nomenclatura del archivo, (4) docs viejos = obsoletos.
- Rotación: pausar y renombrar "BORRAR · ... (VENCIDO/CANCELADO)" cuando pasa la última fecha del taller. Mínimo 3 personas para abrir.
- Meta: conversaciones ganadoras ≤$10, blended ≤$15. Semáforo: apagar si conv >$70 dos días; rotar creativo si frecuencia >3.5.

## EJECUCIÓN PENDIENTE (orden de Manuel, autorizada: crear Y activar)

Tanda 2 — 9 anuncios según `docs/marketing/COPYS_ANUNCIOS_Septiembre_Tanda2.md` (copys se pegan LITERALES; el MCP no soporta encabezado/descripción/mensaje predefinido — solo texto principal, imagen, CTA WHATSAPP_MESSAGE, link https://wa.me/5215665271901):

1. Verificar los 9 artes en la biblioteca (ads_get_ad_images) por nomenclatura AAAAMMDD_Taller_SUCURSAL.
2. Crear creativos + anuncios y ACTIVAR, repartidos así:
   - Nativitas A: Tiramisú Douyin Nat (11y13 sep), Pizza para Principiantes (18y20), Mixiotes (20)
   - Nativitas B: Paella (17y19), Pastelería para Principiantes Nat (18y20), Macarons (17y19) ⚠️ PENDIENTE: el copy trae "mayor margen"/"Alto margen" (frase prohibida) — preguntar a Manuel antes de subir ese; los otros 8 van directo.
   - División A: Tiramisú Douyin Div (17y19), Coctelería Básica (19, 4PM, alcohol)
   - División B: Pastelería para Principiantes Div (18y20)
3. NO pautar Bolillo 5 sep (es fecha espejo).
4. Reporte: métricas de ayer por ad set + últimos 3 días por anuncio + registros frescos de la hoja de Leslie. Rotación: pausar anuncios cuya última fecha ya pasó.

## Otros pendientes

- Experimento TEST·LAL·División: Manuel debe duplicar PERM·División B en Ads Manager (nombre TEST·LAL·División, Lookalike 1%, $150/día) y publicarlo; al confirmarse, Claude le monta anuncios v3 de División. Regla: 14 días o $2,000; gana si conv ≤$20 vs los $32 de División B.
- Propuesta de presupuestos esperando ok: NatA $600, NatB $600, DivA $250, DivB $150, TEST $150.
- Velas Nativitas 5 sep: 18 apartados con aforo 15 — corte 72h (2 sep) decide Dirección segunda sesión.
- Videos de la tanda: Meta los rechaza al subir (escalado con Meta); la tanda sale con imagen fija y los videos se agregan después.
