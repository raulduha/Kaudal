# Prompts para Claude Code — continuar Kaudal desde acá

> Abre el proyecto en Claude Code (está en la carpeta raíz; la app en `app/`). Ejecuta estos prompts **uno a la vez**, en orden. Cada uno dice qué construir, qué spec leer y qué subagentes correr. Ya existe la Ruta 1 (Next.js + Mastra) funcionando en `app/`.

## Estado actual (contexto para Claude Code)
- `app/` = Next.js 15 + Mastra, con un agente de ejemplo y `/api/run` (modo demo sin API key). Compila y corre.
- Specs de ingeniería en `docs/eng/` (00 a 09). Definición cerrada en `docs/18-definicion-producto.md`.
- Subagentes en `.claude/agents/` (seguridad, qa, diseño, accesibilidad, db, compliance, etc.).
- Marca en `brand/brand.config.ts`. Prompt de diseño en `prompts/claude-design-prompt.md`.
- Modelo: OPERADOR (dueño) inscribe CLIENTES; el cliente pone su propia API key (cifrada), ve su uso y pone reclamos.

---

## Prompt 0 — Orientación (córrelo primero)
```
Lee docs/18-definicion-producto.md y docs/eng/00 a 09 para entender el producto y la arquitectura.
Lee app/ para ver el estado actual (Next.js + Mastra, Ruta 1).
Lee .claude/agents/README.md para saber qué subagentes usar.
No escribas código todavía: devuélveme un plan corto de cómo vas a construir las piezas que faltan, en el orden de estos prompts. Respeta brand/brand.config.ts (no hardcodear colores).
```

## Prompt 1 — Design system + base visual
```
En app/, instala y configura Tailwind + un design system basado en brand/brand.config.ts (modo oscuro por defecto, acentos violeta/menta/naranjo, tipografía Sora + JetBrains Mono).
Crea los componentes base de docs/07-ux-y-diseno.md y docs/eng/05: tarjeta de agente, chip de estado, KPI card, tarjeta de cliente, tarjeta de ticket, badge de rol (Operador naranjo / Cliente menta), inputs, botones, toasts.
Mantén la página actual funcionando. Al terminar, corre el subagente diseno-moderno y luego accesibilidad.
```

## Prompt 2 — Supabase + modelo de datos + RLS
```
Implementa el modelo de datos de docs/eng/02 con Supabase (Postgres): orgs/operador, clientes, usuarios, api_keys_cifradas, agentes, registros_uso, suscripciones, cobros, tickets, mensajes_ticket, audit_log.
Toda tabla con id, org_id (donde aplique), created_at, updated_at. Habilita RLS con políticas que aíslen por org/cliente. audit_log append-only.
Escribe una prueba que confirme que un cliente NO puede leer datos de otro.
Corre db-guardian y luego security-auditor. No cierres si RLS no está probada.
```

## Prompt 3 — Auth y roles (operador / cliente)
```
Implementa autenticación con Supabase: sesión con cookie HTTP-only, revalidación server-side.
Dos roles: operador (dueño) y cliente. El cliente NO se auto-registra: lo inscribe el operador.
Rutas protegidas por rol. Layout distinto por lado (badge naranjo operador / menta cliente).
Sigue docs/eng/03 (auth) y docs/eng/00 (roles). Corre security-auditor. Cierra con code-reviewer.
```

## Prompt 4 — Inscribir cliente (operador)
```
Construye la pantalla y API para que el operador inscriba un cliente (razón social, RUT, contacto) y le cree su cuenta (rol cliente), según docs/eng/00 (flujo 3.1) y docs/eng/05.
El cliente recibe acceso y define su contraseña. Deja claro en la UI que el cliente no se registra solo.
Corre diseno-moderno y code-reviewer.
```

## Prompt 5 — Cliente pone su API key (CIFRADA) — CRÍTICO
```
Implementa el flujo donde el cliente ingresa su propia API key del proveedor de modelo, siguiendo docs/eng/03 (Seguridad y API keys).
Requisitos NO negociables: la key se cifra server-side (AES-GCM/libsodium con clave del servidor o KMS), NUNCA se guarda en texto plano, NUNCA vuelve al frontend en claro, NUNCA se loguea. El frontend solo muestra enmascarado (sk-…AB12) y estado válida/inválida. Aislada por org.
El operador solo ve la versión enmascarada (confidencialidad bilateral, docs/18 §9).
Corre security-auditor (bloqueante) y compliance-cl. No cierres con hallazgos altos.
```

## Prompt 6 — Registrar agente que ya corre
```
Construye el registro de un agente existente (n8n/Mastra/código) por su endpoint/webhook, con healthcheck visual, según docs/eng/01 y docs/eng/05.
Guarda: nombre, cliente, endpoint, modelo que usa, canal, estado (vivo/caído). Prueba de conexión con resultado visual.
Corre diseno-moderno y code-reviewer.
```

## Prompt 7 — Uso y costo (captura + pantalla "dónde se usa")
```
Implementa la captura/estimación de uso de docs/eng/07: eventos de uso reportados por el agente (endpoint para que el agente notifique) y/o estimación por usos × modelo.
Integra la lógica de tools/calculadora-agentes.html como pantalla dentro del producto.
Construye la pantalla del cliente "Dónde se usa" (docs/eng/06): usos por día/agente, costo estimado, modelo que usa, y su límite con aviso al acercarse al tope (docs/18 §10). Actualización en vivo (WebSocket).
Corre diseno-moderno, accesibilidad y code-reviewer.
```

## Prompt 8 — Portal del cliente (visual y simple)
```
Termina el portal del cliente de docs/eng/06: inicio (dónde se usa), mi agente (caja negra: modelo, estado, "cómo le va" — sin exponer prompts ni lógica), y navegación simple.
Español de Chile, cero jerga, microcopy y estados vacíos que enseñan. Muy visual y bonito.
Corre diseno-moderno y accesibilidad (bloqueante para "listo").
```

## Prompt 9 — Dudas y reclamos (tickets)
```
Implementa el sistema de tickets de docs/eng/08: el cliente crea dudas/reclamos desde su portal; el operador los ve en una bandeja (kanban Nuevos/En revisión/Resueltos) y responde; hilo de mensajes tipo chat; estados; notificación en vivo (WebSocket); adjuntos.
Corre diseno-moderno, security-auditor (adjuntos/permisos) y qa-tester.
```

## Prompt 10 — Cobros (Flow + boleta/factura DTE)
```
Implementa el cobro de docs/eng/07 y docs/13: suscripción con Flow (crear, cargo, webhook de confirmación con validación de firma) y emisión de boleta/factura vía proveedor DTE (ej. LibreDTE) al confirmarse el pago. CLP + IVA. Pantalla de cobros del operador y estado de cuenta del cliente.
Corre security-auditor (pagos/webhooks), compliance-cl y code-reviewer.
```

## Prompt 11 — Despliegue
```
Prepara el despliegue de docs/eng/09 y docs/16: Dockerfile + variables de entorno (llaves nunca en el código). Deploy a Railway. Deja instrucciones y CI (build+lint+typecheck+tests) con gates de security-auditor y db-guardian.
Corre deployment y devops-infra.
```

## Prompt 12 — Endurecimiento final (antes de un cliente real)
```
Corre una pasada completa: security-auditor sobre todo (foco en las API keys de clientes), compliance-cl (datos personales Chile), qa-tester (flujos críticos + aislamiento entre clientes), accesibilidad (WCAG AA) y diseno-moderno (consistencia).
Documenta con docs-writer. Entrega un reporte GO/NO-GO para poner el primer cliente real.
```

---

## Reglas para Claude Code (recordatorio)
- Un prompt = un PR; revisar con los subagentes antes de mergear.
- brand/brand.config.ts es la única fuente de marca; no hardcodear colores.
- Seguro por defecto: secretos server-side, aislamiento por cliente, API keys cifradas.
- Si algo falla 2-3 veces, detente y pide contexto en vez de insistir.
- El hito real: 1 cliente registrado, con su API key, viendo su uso, con un reclamo respondido y cobrado por Flow con boleta emitida.
