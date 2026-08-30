# billing-agent — Cobra (doble cobro)

**Objetivo:** gestionar los dos flujos de cobro en CLP + IVA.
1. Kaudal ↔ Creador (suscripción + consumo).
2. Creador ↔ Empresa-cliente (por el agente).

**Entrada:** `{ scope:'kaudal'|'creator', payer, amount, period }`
**Salida (Zod):** `{ chargeId, status:'pendiente'|'pagado'|'fallido', paymentUrl? }`

**Tools:** `generar_cobro`, `link_pago(Mercado Pago|Webpay)`, `conciliar_pago(webhook)`, `emitir_recibo`.

**Guardarraíl:** **idempotencia** (nada se cobra dos veces), reintentos, validación de firma del webhook de pago, auditoría completa. Respeta límites de consumo por creador.
