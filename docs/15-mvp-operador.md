# 15 · MVP del Sistema Operador (la plataforma que quieres)

> Tu frase: "quiero ver, organizar y cobrar todos mis agentes en un solo sitio". Este es el spec mínimo para lograrlo, **sin reescribir tus agentes** (siguen en n8n). Es Kaudal versión 1: solo para ti (el operador).

## 1. Qué es (y qué NO es) el MVP
**Es:** un panel donde registras tus agentes (que corren en n8n), los organizas por cliente, ves si están vivos, y cobras la suscripción mensual con boleta/factura. Cada cliente tiene un portal simple.
**No es (todavía):** un motor de agentes propio, un marketplace para otros creadores, ni marketing autónomo. Eso es después.

## 2. Los 4 trabajos que hace (y nada más)
1. **VER** — un tablero con todos tus agentes: cuál está vivo, cuál falló, cuántas ejecuciones hoy.
2. **ORGANIZAR** — cada agente asignado a un cliente; carpetas/etiquetas; separación limpia.
3. **COBRAR** — suscripción mensual por cliente vía Flow + boleta/factura vía proveedor DTE.
4. **MOSTRAR** — un portal por cliente (con su marca) donde ve su agente y pone reclamos.

## 3. Modelo de datos (mínimo)
- `clientes` — tus empresas-cliente (nombre, contacto, marca/logo, estado de pago).
- `agentes` — cada agente que operas (nombre, descripción, **cliente_id**, **n8n_workflow_id**, canal, estado: activo/pausado/caído).
- `ejecuciones` — log de corridas por agente (fecha, resultado, éxito/fallo) — alimentado por webhooks de n8n.
- `suscripciones` — plan y monto por cliente (CLP), estado (al día/pendiente/moroso), próxima fecha de cobro.
- `cobros` — cada cobro generado (monto, estado Flow, id de boleta/factura DTE).
- `reclamos` — casos que el cliente levanta desde su portal.
- `usuarios` — tú (admin) y accesos de cada cliente (creados por ti; el cliente no se registra).
Todas con `created_at`, `updated_at`. (Multi-tenant real llega en v2; por ahora eres un solo dueño.)

## 4. Pantallas del MVP
1. **Dashboard operador (tú):** tarjetas de KPIs (agentes activos, caídos, ejecuciones hoy, ingresos del mes, cobros pendientes) + lista de agentes con estado en vivo + feed de actividad.
2. **Detalle de agente:** a qué cliente sirve, su workflow n8n (link), últimas ejecuciones, estado, botón pausar/reactivar.
3. **Clientes:** lista + ficha de cada cliente (sus agentes, su cobro, su portal, su marca).
4. **Cobros:** suscripciones por cliente, generar cobro, estado de pago, boletas emitidas.
5. **Portal del cliente (vista aparte, con su marca):** su(s) agente(s), métricas simples, botón "Poner un reclamo", historial.
6. **Config:** tus llaves (n8n, Flow, DTE), tu marca por defecto.
El diseño visual de todo esto está en `prompts/claude-design-prompt.md` (usa C1, C4, C5, D1, D2; ignora por ahora B1-B3 de multi-tenant).

## 5. Integraciones (todo por API, nada a mano)
- **n8n:** cada workflow notifica a Kaudal por webhook al terminar (éxito/fallo) → alimenta `ejecuciones` y el estado "vivo/caído". Kaudal puede también disparar/pausar workflows vía la API de n8n.
- **Flow:** crear suscripción y cobrar; recibir confirmación por webhook (validar firma) → actualiza `cobros`/`suscripciones`.
- **Proveedor DTE (LibreDTE/otro):** al confirmarse un pago, emitir boleta/factura por API → guardar id en `cobros`.
- **Canal del agente (WhatsApp/Telegram):** lo maneja el propio workflow n8n; Kaudal solo lo registra.

## 6. Cómo se ve el "estar vivo" (monitoreo simple)
- Cada agente reporta su última ejecución. Si no reporta en X tiempo o falla N veces → estado "caído" (rojo) + alerta.
- Nada sofisticado: un heartbeat y un contador de fallos. Suficiente para dormir tranquilo.

## 7. Plan de construcción (solo tú, por fases cortas)
**Fase 1 — Orden (semana 1-2):** app + auth (solo tú) + CRUD de clientes y agentes + link a workflows n8n + dashboard con estado manual. *Ya sirve: tienes todo en un sitio.*
**Fase 2 — Vivo (semana 3):** webhooks de n8n → `ejecuciones` + estado vivo/caído + alertas.
**Fase 3 — Cobrar (semana 4-5):** Flow (suscripción) + proveedor DTE (boleta) + pantalla de cobros.
**Fase 4 — Portal cliente (semana 6):** vista con marca del cliente + reclamos.
Después de esto, recién evaluar v2 (multi-tenant, Mastra, subagentes del sistema).

## 8. Dónde te freno (crítico, como pediste)
- **No construyas v2 (multi-tenant/pago para otros) hasta cobrarte a ti mismo con ≥2-3 clientes reales.** Si no, es plomería sin validar.
- **No metas el runtime propio (Mastra) en el MVP.** n8n ya corre tus agentes; migrar es optimización futura.
- **El portal del cliente parte súper simple.** Un cliente feliz con "veo mi agente y pongo reclamo" vale más que 10 features.
- **Si en la Fase 1 sientes que el CRUD + n8n te basta y no necesitas más, dímelo:** quizás no necesitas ni la Fase 3-4 aún, y eso también es un resultado válido (ahorrar es ganar).
