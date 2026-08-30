# system-agents/ — Subagentes del Sistema (runtime)

Estos subagentes viven en el **backend (NestJS + Mastra)** y operan dentro de Kaudal para llevar cualquier agente de creado a vivo (venta, cobro, marketing, despliegue, revisión). Ver `docs/12-subagentes-del-sistema.md`.

> No confundir con `.claude/agents/` (subagentes de Claude Code que ayudan a *construir* Kaudal). Estos son parte del producto.

## Contrato común (todos lo cumplen)
```ts
interface SystemAgent<Input, Output> {
  id: string;                       // "sales-closer", etc.
  run(ctx: RunContext, input: Input): Promise<Output>; // salida validada con Zod
}
interface RunContext {
  orgId: string;                    // aislamiento por tenant SIEMPRE
  creatorId: string;
  agentId: string;                  // el agente de negocio que se está desplegando
  audit: (event: AuditEvent) => void;
  emit: (state: PipelineState) => void; // actualiza la UI en vivo (WebSocket)
}
```
Reglas: acotado al `orgId`, secretos server-side, salida estructurada (Zod), idempotencia, auditoría, y (revisores) capacidad de **bloquear** el pipeline.

## Archivos
- `orchestrator.spec.md` — coordina el pipeline e2e.
- `sales-closer.spec.md` — vende.
- `billing-agent.spec.md` — cobra (doble cobro).
- `brand-marketing.spec.md` — naming, brand clearance, social card, landing, copys.
- `deployer.spec.md` — provisiona canal, publica, monitorea.
- `reviewers.spec.md` — security / quality / compliance (bloqueantes).

## Registro en el orchestrator
Cada subagente se registra por `id`; el orchestrator arma el grafo del pipeline con Mastra Workflows y ejecuta en paralelo lo independiente.
