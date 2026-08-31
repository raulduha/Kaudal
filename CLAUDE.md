# CLAUDE.md — Instrucciones para Claude Code

Este archivo orienta a Claude Code cuando trabaja en el proyecto **Kaudal** (ERP de agentes de IA para PYMES de Chile).

## Contexto del producto
Kaudal permite a una empresa tener agentes de IA que trabajan solos (soporte, ventas, cobranza, documentos, marketing), gestionados desde un panel visual estilo n8n pero más lindo y simple. El cliente objetivo **no es técnico**: dueños de PYMES chilenas. Lee `docs/00-vision-y-naming.md` antes de tomar decisiones de producto.

## Reglas de oro
1. **Español chileno, claro y sin tecnicismos** en toda la UI y los mensajes al usuario final.
2. **Seguro por defecto.** Nunca pongas secretos en el cliente. Todo dato se aísla por empresa (multi-tenant con RLS). Lee `docs/04-seguridad-y-compliance.md`.
3. **TypeScript estricto.** Nada de `any` sin justificación. Validación con Zod en todos los bordes.
4. **Server-first.** Lógica sensible en Route Handlers / Server Actions, nunca en el navegador.
5. **Todo auditable.** Cada acción de un agente deja registro (quién, qué, cuándo, resultado).
6. **Visual antes que técnico.** Si hay que elegir entre exponer un JSON o una tarjeta bonita, gana la tarjeta. Ver `docs/07-ux-y-diseno.md`.

## Stack (resumen — detalle en docs/02)
- **Frontend/Dashboard:** Next.js 15, React 19, TypeScript, Tailwind, shadcn/ui.
- **Canvas de workflows:** React Flow (`@xyflow/react`).
- **Orquestación de agentes:** **Mastra** (`@mastra/core`, `@mastra/memory`) sobre Vercel AI SDK.
- **Modelos:** Claude (Anthropic) para razonamiento; configurable por agente.
- **Datos:** Supabase (Postgres + Auth + Storage), Row Level Security por `org_id`.
- **Mensajería:** Twilio WhatsApp Business (canal principal en Chile).
- **Colas/eventos:** Supabase + Inngest (o QStash) para tareas y reintentos.

## Comandos de desarrollo
Todo el código vivo está bajo `app/` (Next.js). Corre los comandos ahí:
```bash
cd app
npm install
cp .env.example .env.local   # opcional: ANTHROPIC_API_KEY (sin ella, la app corre en modo demo)
npm run dev                  # http://localhost:3000
npm run build
npm run start
npm run typecheck            # tsc --noEmit
npm test                     # Vitest: RLS, uso, cobros sandbox e instancias
```
Todavía no hay `lint` ni `test` configurados en `app/package.json` (llegan en Fase 1/2 de `TASKS.md`); no los inventes ni asumas que existen.

## Arquitectura del repo
- **`app/`** es la única aplicación real (Next.js 15, App Router, TS estricto). Todo lo demás en la raíz (`docs/`, `prompts/`, `system-agents/`, `templates/`, `tools/`) es documentación/specs, no código que se ejecuta.
  - `app/src/mastra/agent.ts` — define el/los agente(s) con `@mastra/core` + `@ai-sdk/anthropic` (modelo e instrucciones se eligen acá).
  - `app/src/app/api/run/route.ts` — Route Handler que valida el body con Zod y corre el agente. Si falta `ANTHROPIC_API_KEY` responde en **modo demo** (mismo contrato de respuesta, sin llamar al modelo) — mantén ese fallback al tocar este archivo.
  - `app/src/app/page.tsx` — dashboard SaaS del operador. El demo Mastra sigue aislado como ejemplo; no lo conviertas en el motor del producto.
- **`brand/brand.config.ts`** es la fuente única de verdad de marca y color (nombre, tagline, tokens de color oscuro/claro, colores por estado de agente, tipografía, radios). Nunca hardcodear "Kaudal" ni colores en componentes: importar desde acá.
- **`docs/eng/00..09`** son los specs de ingeniería autoritativos (modelo de datos, seguridad/API keys, backend, frontend operador, portal cliente, uso/cobros, reclamos, despliegue) — cada fase de `TASKS.md` apunta a uno o más de estos.
- **`docs/00..18`** (raíz de `docs/`) son los docs de producto/negocio; `docs/18-definicion-producto.md` tiene las decisiones cerradas y `docs/15-mvp-operador.md` define el alcance del MVP actual (operador solo, multi-tenant es Fase 2).
- **`.claude/agents/`** son los subagentes de Claude Code (listados abajo) que construyen Kaudal; **`system-agents/`** son specs de agentes que la plataforma misma operará más adelante (Fase 2) — no confundirlos.
- Estado actual: fases 0–8, 9.1, 11.1 y gran parte de 11.5 están implementadas localmente. Lee primero `docs/eng/14-handoff-claude-code-2026-08-31.md` y el runbook vigente `docs/eng/15-runbook-produccion-railway-2026-08-31.md`; luego usa `TASKS.md` para tomar la primera tarea pendiente.

## Subagentes disponibles (`.claude/agents/`)
Usa el subagente correcto según la tarea. No los reinventes:
- `security-auditor` — antes de cada merge que toque auth, datos o pagos.
- `code-reviewer` — revisión de todo PR.
- `qa-tester` — diseña y corre pruebas.
- `deployment` — checklist y despliegue seguro.
- `marketing-deployer` — publica campañas/landing del bot de marketing.
- `devops-infra` — infraestructura, entornos, secretos.
- `agent-builder` — crea nuevos agentes de negocio desde una plantilla.
- `db-guardian` — migraciones y políticas RLS de Supabase.
- `docs-writer` — mantiene la documentación al día.
- `compliance-cl` — cumplimiento de datos personales en Chile.

## Convenciones de código
- Estructura por features (`/features/<dominio>`), no por tipo de archivo.
- Nombres de tablas y columnas en `snake_case`; tipos TS en `PascalCase`.
- Toda tabla incluye `org_id`, `created_at`, `updated_at`.
- Errores hacia el usuario final: mensajes humanos en español; logs técnicos aparte.
- Commits: Conventional Commits en español (`feat:`, `fix:`, `docs:`...).

## Definición de "listo" (Definition of Done)
- [ ] Pasa `security-auditor` sin hallazgos altos.
- [ ] Pasa `code-reviewer`.
- [ ] Tiene pruebas (`qa-tester`) para el camino feliz y 2 bordes.
- [ ] RLS verificada por `db-guardian` si tocó datos.
- [ ] Textos de UI en español revisados.
- [ ] Documentado por `docs-writer` si cambió comportamiento.

## Tablero de tareas (trabaja solo con esto)
El plan de construcción vive en `TASKS.md` (raíz). Flujo de trabajo por defecto:
1. Lee `TASKS.md` y toma la **primera tarea sin marcar** `[ ]`, en orden.
2. Lee el/los doc(s) de `docs/eng/` que indica la tarea.
3. Constrúyela (rama/PR), corre los **subagentes** que la tarea nombra, verifica la **DoD**.
4. **Marca la casilla** `[x]` y anota 1 línea en el "Registro" del final de `TASKS.md`.
5. Pasa a la siguiente. Si te bloqueas 2-3 veces, detente y pide contexto.
Los prompts detallados equivalentes están en `prompts/claude-code-prompts.md`.

## MODELO DE AGENTES (leer — evita construir lo equivocado)
- **Los agentes SON flujos de n8n** que el operador (Raúl) arma y prueba. Cada cliente puede tener agentes distintos, de cualquier tipo.
- **Kaudal (esta app en `app/`) es el PANEL / plano de control**, NO el motor de agentes. Kaudal:
  1. Inscribe clientes y les crea cuenta.
  2. Registra y (opcional) **despliega** su n8n en Railway (una instancia por cliente).
  3. Muestra su **uso/costo estimado** (el cliente pone su propia API key, cifrada).
  4. **Cobra** la mantención con Flow + boleta/factura DTE.
  5. Da **tickets** (dudas/reclamos) y portal al cliente.
- Kaudal **NO** ejecuta la lógica del agente ni proxya las llamadas al modelo.
- El demo Mastra en `app/src/mastra/` es SOLO un ejemplo de arranque para tener algo corriendo; **no es el motor**. Puede quedar como ejemplo opcional o eliminarse. La Ruta Mastra (`docs/17`) es una línea futura opcional, NO el camino principal.
- Camino principal = construir el PANEL siguiendo `TASKS.md` y `docs/eng/`.
