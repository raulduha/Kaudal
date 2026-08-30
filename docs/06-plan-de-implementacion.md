# 06 · Plan de Implementación

Partimos de un producto que se construye por fases, priorizando lo que **ya funciona y vende** (ver `docs/03`). El objetivo es tener un MVP demostrable rápido y luego iterar.

## Fase 0 · Fundaciones (semana 1–2)
- Monorepo (Next.js + Mastra + Supabase) y `brand.config.ts`.
- Auth, orgs y roles; RLS base (`db-guardian`).
- CI/CD con gates de seguridad (`devops-infra`).
- Sistema de diseño (tokens de marca, shadcn/ui).
**Entregable:** login, crear empresa, dashboard vacío bonito.

## Fase 1 · Primer agente end-to-end (semana 3–4)
- Canal WhatsApp (webhook Twilio validado).
- Motor Mastra + **Agente de Atención al Cliente** (RAG con la info de la empresa).
- Bandeja de revisión humana + auditoría (`agent_runs`).
**Entregable:** un cliente final escribe por WhatsApp y el agente responde; el dueño lo ve todo en el panel. **Esto ya es demo vendible.**

## Fase 2 · Canvas visual + más agentes (semana 5–7)
- Canvas de workflows (React Flow) para ver/editar cómo trabaja el agente.
- Agentes de **Ventas/SDR**, **Cobranza** y **Documentos** desde `agent-builder`.
- Biblioteca descargable (`docs/08`).
**Entregable:** varios agentes activables con clics + workflows visibles y descargables.

## Fase 3 · Cobro + multi-tenant productivo (semana 8–9)
- Suscripciones y pagos (Mercado Pago/Webpay), planes de `docs/05`.
- Medición de consumo por org y topes.
- Endurecimiento de seguridad (`security-auditor`) y compliance (`compliance-cl`).
**Entregable:** onboarding self-service con cobro real.

## Fase 4 · Marketing + pulido (semana 10–12)
- **Bot de marketing** (`docs/09`) y landing de campañas (`marketing-deployer`).
- Postventa/Reclamos y Agenda.
- Evals de agentes, reportería básica, pulido visual.
**Entregable:** producto redondo, con historia de marketing y casos de uso demostrables.

## Piloto y puesta en marcha (a la referencia)
Igual que OxideLabs: ofrecer un **paquete de puesta en marcha + piloto acompañado** (ej: 6 semanas de ajustes + 3 meses de operación acompañada) que se abona al precio final. Durante el piloto: soporte y ajustes dentro del alcance.

## Roles del equipo (mínimo viable)
- 1 full-stack (Next.js + Mastra).
- 1 con foco en agentes/prompts + datos.
- Apoyo de diseño (o Claude Design con el prompt maestro).
- Los subagentes de Claude Code cubren seguridad, QA, deploy y docs.
