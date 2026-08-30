# 02 · Stack Tecnológico

## Resumen (tabla de decisión)
| Capa | Tecnología | Por qué |
|---|---|---|
| Frontend / Dashboard | **Next.js 15 + React 19 + TypeScript** | Estándar moderno, server components, un solo lenguaje full-stack |
| Estilos / UI | **Tailwind CSS + shadcn/ui** | Rápido, consistente, componentes accesibles listos |
| Canvas de workflows | **React Flow (`@xyflow/react`)** | Es la librería estándar para editores de nodos tipo n8n |
| Orquestación de agentes | **Mastra** (`@mastra/core`, `@mastra/memory`) | Framework TS de agentes, con workflows, memoria, RAG y evals |
| Capa de modelos | **Vercel AI SDK** (bajo Mastra) | Cambiar de modelo/proveedor sin reescribir |
| Modelo principal | **Claude (Anthropic)** | Razonamiento fuerte, buen seguimiento de instrucciones en español |
| Base de datos | **Supabase (Postgres)** | Postgres real + Auth + Storage + Realtime + RLS multi-tenant |
| Vectores / memoria larga | **pgvector** (en Supabase) | RAG sin infra extra |
| Storage | **Supabase Storage** (bucket privado) | Archivos con URLs firmadas temporales |
| Mensajería | **Twilio WhatsApp Business** | Canal #1 en Chile; luego Meta Cloud API a escala |
| Colas / jobs / cron | **Inngest** (o QStash) | Reintentos, tareas programadas, recordatorios, durabilidad |
| Emails transaccionales | **Resend** o **SendGrid** | Notificaciones y bot de marketing |
| Pagos | **Mercado Pago** / **Transbank (Webpay)** | Estándar de cobro en Chile (CLP) |
| Observabilidad | **Sentry + logs de Mastra** | Errores y trazas de agentes |
| Deploy | **Vercel** (SaaS) + **Docker** (on-premise) | Nube por defecto, contenedor para licencia/on-premise |

## ¿Por qué Mastra? (sí, lo recomiendo)
**Mastra** es un framework de agentes escrito en TypeScript, pensado para producción, muy vigente en 2026. Encaja perfecto porque:

1. **Es TypeScript nativo.** El mismo lenguaje del frontend/backend Next.js: un solo equipo, un solo stack.
2. **Trae lo que necesitamos sin pegamento:**
   - **Agents:** define agentes con instrucciones, herramientas y modelo.
   - **Workflows:** grafos de pasos con ramas, reintentos y estado durable — se mapean 1:1 al canvas visual.
   - **Memory:** memoria por conversación y por usuario (con pgvector).
   - **RAG:** para que los agentes respondan con documentos de la empresa.
   - **Evals:** para medir calidad de los agentes (clave para vender confianza).
   - **MCP:** puede consumir herramientas externas vía Model Context Protocol.
3. **Model-agnostic:** corre sobre el Vercel AI SDK, así que cambiar Claude por otro modelo (o usar varios) es configuración, no reescritura.
4. **Portabilidad:** el mismo código de agentes corre en la nube de Kaudal o en la infraestructura del cliente (planes on-premise / licencia).

> **Cuándo NO forzar Mastra:** para automatizaciones triviales sin razonamiento (mover un dato de A a B), un workflow simple basta. Mastra brilla cuando el agente **decide**. Regla: si hay criterio/decisión → agente Mastra; si es puro ETL → workflow directo.

## Alternativas consideradas (y por qué no)
- **LangChain/LangGraph (Python):** potente, pero parte el stack en dos lenguajes y suma complejidad de despliegue. Mastra da lo mismo en TS.
- **n8n como backend real:** excelente para prototipar, pero no es una base de producto white-label ni multi-tenant seguro; lo usamos como *inspiración de UX*, no como motor.
- **Orquestar "a mano" con solo el AI SDK:** se puede, pero reescribiríamos memoria, workflows durables y evals que Mastra ya resuelve.

## Estructura del repositorio (monorepo sugerido)
```
kaudal/
├── apps/
│   ├── web/              # Next.js: dashboard + landing + widget
│   └── worker/           # Jobs Inngest (recordatorios, reintentos)
├── packages/
│   ├── agents/           # Definiciones Mastra (agentes, tools, workflows)
│   ├── db/               # Esquema Supabase, migraciones, políticas RLS
│   ├── ui/               # Componentes compartidos (shadcn + marca)
│   └── config/           # brand.config.ts, env, constantes
├── templates/            # Agentes/workflows descargables (ver docs/08)
└── .claude/agents/       # Subagentes de Claude Code
```

## Variables de entorno (nunca en el cliente)
```
# Modelos
ANTHROPIC_API_KEY=
# Supabase
SUPABASE_URL=
SUPABASE_ANON_KEY=              # solo lectura pública, protegida por RLS
SUPABASE_SERVICE_ROLE_KEY=      # SOLO server-side
# Twilio WhatsApp
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=
# Pagos
MERCADOPAGO_ACCESS_TOKEN=
# Infra
INNGEST_EVENT_KEY=
SENTRY_DSN=
```
> Regla dura: `SERVICE_ROLE_KEY`, tokens de Twilio y claves de modelo **viven en variables de entorno del servidor, jamás en el navegador**. Ver `docs/04`.

## Requisitos de entorno de desarrollo
- Node 20+ (tienes v22 ✅).
- pnpm (recomendado para monorepo) o npm.
- Cuenta Supabase, Twilio (sandbox de WhatsApp para probar), Anthropic.
