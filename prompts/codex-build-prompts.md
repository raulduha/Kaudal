# Prompts de Build para Codex / Claude Code

Secuencia de prompts para construir Kaudal por fases (ver `docs/06`). Ejecuta uno a la vez, revisando con los subagentes entre medio. Cada prompt asume que el repo ya tiene `docs/`, `.claude/agents/`, `brand/` y `templates/`.

---

## Prompt 0 — Scaffolding del monorepo
```
Crea el monorepo de Kaudal según docs/02-stack-tecnologico.md:
- pnpm workspaces con apps/web (Next.js 15, App Router, TS, Tailwind) y apps/worker (Inngest).
- packages/agents (Mastra), packages/db (Supabase + migraciones), packages/ui (shadcn + tokens de brand/brand.config.ts), packages/config.
- Configura ESLint estricto, Prettier, TS strict, y CI (build+lint+typecheck+test) con gates para security-auditor y db-guardian.
Usa brand/brand.config.ts como fuente de marca. No hardcodees "Kaudal".
Al terminar, invoca al subagente code-reviewer.
```

## Prompt 1 — Base de datos y multi-tenant
```
Implementa el esquema de packages/db según docs/01-arquitectura.md (sección 6) con Supabase:
tablas orgs, users, agents, agent_runs, workflows, conversations, messages, review_queue, contacts, audit_log, documents, subscriptions.
Toda tabla con id(uuid), org_id(uuid, NOT NULL, indexado), created_at, updated_at.
Habilita RLS en todas las tablas de cliente con políticas que filtren por org_id del usuario autenticado. audit_log append-only.
Escribe una prueba que confirme que un usuario de la org A NO puede leer datos de la org B.
Invoca db-guardian y luego security-auditor antes de cerrar.
```

## Prompt 2 — Auth, orgs y layout del dashboard
```
Implementa auth con Supabase (cookies HTTP-only, revalidación server-side) y roles owner/admin/operator/viewer.
Crea el layout del dashboard según docs/07-ux-y-diseno.md (3.2): sidebar, topbar, selector de empresa.
Usa los tokens de brand/brand.config.ts y shadcn/ui. Modo oscuro por defecto.
Aplica los diseños de Claude Design si están disponibles.
Cierra con code-reviewer.
```

## Prompt 3 — Canal WhatsApp + primer agente (Atención)
```
Implementa el gateway de WhatsApp con Twilio en apps/web (Route Handler):
valida la firma de Twilio, normaliza teléfono, identifica org y contacto, idempotencia.
En packages/agents crea con Mastra el Agente de Atención al Cliente usando templates/agents/soporte-cliente.json:
instrucciones, tools (buscar_conocimiento con RAG/pgvector, consultar_pedido, derivar_a_humano), memoria, umbral de confianza.
Registra cada corrida en agent_runs. Si confianza < umbral, crea tarjeta en review_queue.
Escribe evals de Mastra según el JSON. Invoca security-auditor y qa-tester.
```

## Prompt 4 — Bandeja de revisión + auditoría (UI)
```
Construye la Bandeja de revisión (docs/07-ux-y-diseno.md 3.5) como kanban de 3 columnas con tarjetas de caso,
drawer de detalle con historial de chat, y acciones Aprobar/Editar/Escalar.
Construye la vista de Auditoría (3.6) filtrable y exportable a CSV.
Todo en español de Chile, con los componentes del design system. Cierra con code-reviewer y qa-tester.
```

## Prompt 5 — Canvas de workflows (React Flow)
```
Implementa el Canvas de workflows con @xyflow/react según docs/07-ux-y-diseno.md (3.3):
6 tipos de nodo (disparador, agente, herramienta, condicion, revision_humana, accion), cables curvos,
panel de propiedades, modo Ver/Editar, minimapa. Importa/exporta el formato de templates/workflows/*.json.
Conecta la ejecución a Mastra Workflows. Añade la animación de "flujo corriendo".
Cierra con code-reviewer.
```

## Prompt 6 — Más agentes desde plantilla
```
Usa el subagente agent-builder para crear los agentes ventas-sdr, cobranza y documentos
desde templates/agents/*.json, con sus tools, memoria, evals y auditoría.
Añade sus fichas al catálogo. Cierra con qa-tester y security-auditor.
```

## Prompt 7 — Cobro y suscripciones
```
Implementa suscripciones y pagos según docs/05-modelo-de-cobro.md con Mercado Pago (y/o Webpay):
planes Partida/Pyme/Pro/Empresa, medición de consumo por org, topes y cobro de excedentes.
Página de precios pública (docs/07 3.1) y facturación en CLP + IVA.
Invoca security-auditor (pagos) y compliance-cl. Cierra con code-reviewer.
```

## Prompt 8 — Bot de marketing + biblioteca
```
Implementa el Agente de Marketing (templates/agents/marketing-contenido.json) y la pantalla Biblioteca
(docs/07 3.7 + docs/08) con descarga de plantillas JSON. Integra publicación con aprobación humana vía marketing-deployer.
Cierra con compliance-cl (consentimiento/frecuencia) y qa-tester.
```

## Prompt 9 — Endurecimiento y salida a producción
```
Corre una pasada completa: security-auditor sobre todo el proyecto, compliance-cl sobre el manejo de datos,
qa-tester para cobertura de flujos críticos y multi-tenant, y deployment para el checklist de producción y rollback.
Documenta con docs-writer. Entrega el reporte final GO/NO-GO.
```

---

### Buenas prácticas al usar estos prompts
- Un prompt por PR; revisa con los subagentes antes de mergear.
- Si algo falla 2-3 veces, detente y pide contexto en vez de insistir.
- Mantén `brand.config.ts` como única fuente de marca.
- Cada feature nueva debe apoyarse en lo existente (pricing de suite).
