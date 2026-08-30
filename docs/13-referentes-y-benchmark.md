# 13 · Referentes y Benchmark (qué replicar, qué NO)

> Objetivo: no reinventar lo que ya existe. Kaudal (versión operador) se para sobre herramientas maduras y solo construye lo que falta: **orden + portal por cliente + cobro chileno**.

## 1. Las dos capas (no confundirlas)
| Capa | Qué es | Referentes maduros | Postura de Kaudal |
|---|---|---|---|
| **Runtime** (dónde corren los agentes) | Motor de workflows/agentes | **n8n** (el tuyo), Relevance AI, Lindy, Gumloop, Stack AI | **Usar, no competir.** Empezar sobre n8n; migrar a Mastra lo de alto volumen (híbrido). |
| **Operación** (cómo se maneja el negocio) | Clientes, portales, cobros, white-label | **GoHighLevel** (el "SO de agencias"), y white-label tools (CustomGPT, Pickaxe) | **Replicar el patrón**, aplicado a agentes de IA y a Chile. Aquí está tu valor. |

## 2. El referente a replicar: patrón "GoHighLevel para agentes"
GoHighLevel es famoso porque le da a una agencia **un solo lugar** para: gestionar clientes, darles un portal con su marca, y cobrarles de forma recurrente. Kaudal copia ese patrón pero para **operar agentes de IA**:
- Registro de tus agentes, **separados por cliente** (tu dolor: "los tengo separados, quiero orden").
- **Portal por cliente** con lo que le importa (su agente, métricas, reclamos).
- **Cobro recurrente** integrado.
- Monitoreo de que cada agente sigue vivo.

Lo que NO copiamos de GoHighLevel: su enormidad (CRM completo, email marketing, funnels). Eso es scope creep para un operador solo.

## 3. Qué NO construir (rebuild = pozo sin fondo)
1. **Motor de agentes:** ya lo tienes (n8n) / existe (Mastra). No lo reescribas para el MVP.
2. **Pasarela de pago:** se integra, no se construye. Ver §4.
3. **Factura/boleta electrónica (SII):** JAMÁS a mano. Se integra con proveedor DTE. Ver §5.
4. **Marketing/marca autónomo (naming, "brand clearance"):** riesgo legal si es autónomo. Va como asistente con aprobación tuya, no como subagente que decide solo.

## 4. Cobro en Chile — decisión de stack
| Opción | Recurrente | Cuándo usarla |
|---|---|---|
| **Flow** | ✅ Sí — módulo **Suscripciones** + API de cargo automático | **Recomendada para suscripción mensual de tus clientes.** Simple, chilena, con API. |
| **Mercado Pago** | ✅ Sí — suscripciones | Alternativa/segunda opción; buena si ya lo usas. |
| **Transbank Webpay** | Pago único (recurrente vía Oneclick/PatPass) | Para cobros puntuales o si el cliente exige Webpay. |
| **Khipu** | Transferencia (no recurrente) | Para pagos por transferencia, bajo costo. |

**Decisión sugerida:** **Flow** como pasarela principal (suscripción recurrente por API), con Webpay como opción de pago único. Verifica comisiones y flujo de cargo automático antes de cerrar.

## 5. Factura/Boleta electrónica — decisión de stack
En Chile, todo cobro formal necesita **boleta o factura electrónica (SII)**. No se construye: se integra con un **proveedor DTE**:
- **LibreDTE** (open source / API, popular para integrar), **Nubox**, **Bsale**, **apigateway.cl**.
**Decisión sugerida:** integrar un proveedor DTE por API (evaluar LibreDTE por costo/flexibilidad). El sistema genera el cobro → el proveedor emite el documento. Nunca emitir DTE a mano desde tu app.

## 6. Cómo queda el stack de Kaudal (operador, híbrido)
- **Runtime agentes:** n8n (ahora) → Mastra (alto volumen, después).
- **App operador:** Next.js (frontend) + NestJS (API) — o Next.js full-stack si quieres partir aún más liviano.
- **Datos:** Supabase/Postgres.
- **Cobro:** Flow (suscripción) + proveedor DTE (factura/boleta).
- **Portal cliente:** parte de la misma app.
- **Host:** Raspberry Pi o VPS chico para el MVP tuyo.

## 7. Riesgo que vigilo (crítico)
El error clásico es construir la capa de operación "bonita" antes de tener **1 cliente pagando por un agente**. Antes de pulir Kaudal, el hito real es: **un agente tuyo, un cliente real, cobrado por Flow con boleta emitida.** Si eso funciona a mano, la plataforma solo lo ordena y escala.
