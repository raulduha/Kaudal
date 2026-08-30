# orchestrator — Capataz del pipeline e2e

**Objetivo:** llevar un agente de "creado" a "vivo" ejecutando y coordinando a los demás subagentes.

**Entrada:** `{ agentId, creatorConfig, clientCompany?, pricing }`
**Salida:** `PipelineResult { status: 'vivo'|'bloqueado'|'error', steps: StepState[] }`

**Pasos (grafo Mastra Workflow):**
1. `brand-marketing` (naming, brand clearance, social card) — puede correr en paralelo con 2.
2. `sales-closer` (propuesta + cierre) → crea/asocia empresa-cliente.
3. `billing-agent` (configura cobro).
4. `deployer` (provisiona canal + publica).
5. Revisores en paralelo: `reviewer-security`, `reviewer-quality`, `reviewer-compliance` (BLOQUEANTES).
6. Si todos ok → `deployer.monitor` marca "vivo". Si algún revisor falla → estado "bloqueado" con motivo.

**Reglas:** estado durable, reintentos con backoff, cada transición emite `emit(state)` para la UI (C3) y `audit()`. Rollback si el deploy falla el smoke test.
