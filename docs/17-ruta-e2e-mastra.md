# 17 · Ruta E2E #1 — nativa en Mastra (la ruta flagship)

> Objetivo: construir **UNA** ruta de agente completa, nativa en **Mastra**, **visual y bonita**, con **cobros**, desplegada. Es la prueba de que el producto real funciona de punta a punta. Después extendemos a n8n y a más agentes. Documentamos TODO este camino para poder repetirlo.

## 0. Por qué así (y el tradeoff, como analista crítico)
Elegiste Mastra nativo (no wrapper de n8n) para la ruta 1. **Tradeoff honesto:** construir el agente en Mastra es más trabajo que reusar tu n8n, PERO te deja el producto real (white-label, visual, control total, cobros integrados) — que es lo que quieres mostrar y vender. Vale la pena **para 1 ruta** como flagship. El riesgo a vigilar: no te enamores de la ingeniería; la ruta 1 tiene que llegar a **cobrar a un cliente real**, no quedar linda en tu localhost.

## 1. Qué es una "ruta e2e"
Una ruta = un agente que atraviesa TODO el ciclo, sin huecos:
**Canal → Agente (Mastra) → Herramientas → Decisión/Revisión → Acción → Registro → Portal del cliente → Cobro → Monitoreo.**
Cuando esta ruta funciona entera para un caso, tienes el producto. Todo lo demás es repetir la ruta para otros casos.

## 2. La ruta flagship recomendada
Recomiendo partir con un agente **de texto** (más simple que visión) para que la ruta e2e quede pulida rápido; ejemplos: **Atención/Intake por WhatsApp** o **Cotizador**. Tu caso de **notas→Excel** (visión) es excelente como ruta 2, cuando la e2e ya esté aceitada.
> Si igual quieres partir con notas→Excel, la ruta es la misma; solo suma la tool de visión y de Excel.

## 3. Arquitectura de la ruta (Mastra + Next.js + NestJS)
```
WhatsApp (Twilio)
   → Webhook (NestJS, valida firma)
   → Orquestador (Mastra)
        → Agente (Mastra Agent: instrucciones + tools + memoria)
             → Tools (funciones TS + Zod, acotadas al cliente)
             → Umbral de confianza → ¿resuelve o deriva?
        → Registro en Postgres (agent_runs)
   → Respuesta al cliente
   → Portal del cliente (Next.js) muestra todo en vivo (WebSocket)
   → Cobros (Flow suscripción + boleta DTE)
   → Monitoreo (heartbeat + fallos)
```

## 4. Lo que hay que construir (checklist de la ruta e2e)

### 4.1 Motor del agente (Mastra)
- [ ] Proyecto Mastra dentro del monorepo (`packages/agents`).
- [ ] 1 Agent con: instrucciones (es-CL), 2-3 tools (Zod), memoria (conversación + cliente), umbral de confianza.
- [ ] 3-5 **evals** (casos de prueba) — clave para vender confianza y para el revisor de calidad.
- [ ] Modelo configurable (Claude por defecto vía AI SDK).

### 4.2 Canal (entrada real)
- [ ] Webhook WhatsApp (Twilio) en NestJS, con validación de firma e idempotencia.
- [ ] Normalización de teléfono + identificación de cliente.

### 4.3 Visual (lo bonito, con Claude Design)
- [ ] **Constructor/Canvas** de la ruta (React Flow) — ver el flujo (aunque la ruta 1 sea fija).
- [ ] **Vista del agente** con "cómo piensa" (timeline + confianza).
- [ ] **Portal del cliente** (D1) + **reclamos** (D2).
- [ ] **Dashboard operador** (C1) con estado en vivo.
Diseño: usa `prompts/claude-design-prompt.md` (C1, C2, D1, D2, C5).

### 4.4 Cobros (lo que pediste)
- [ ] Suscripción en **Flow** (cargo mensual) + webhook de confirmación (firma validada).
- [ ] Emisión de **boleta/factura** vía proveedor DTE al confirmarse el pago.
- [ ] Pantalla de cobros (C5): monto, estado, comprobante.
- [ ] La **Calculadora de economía** (entregada) para fijar el precio del agente.

### 4.5 Registro, monitoreo y seguridad
- [ ] `agent_runs` + `audit_log` (todo auditado).
- [ ] Heartbeat + contador de fallos → estado vivo/caído + alerta.
- [ ] Pasada de `security-auditor`, `qa-tester` (evals) y `compliance-cl` antes de "vivo".

### 4.6 Despliegue
- [ ] Local/Raspberry para desarrollar; **Railway** al primer cliente. Ver `docs/16`.

## 5. Orden de construcción (para no perderte)
1. **Semana 1:** agente Mastra + tools + evals corriendo en local (sin UI: por consola/test).
2. **Semana 2:** webhook WhatsApp real → el agente responde de verdad.
3. **Semana 3:** UI visual (dashboard + vista de agente + portal cliente) con Claude Design.
4. **Semana 4:** cobros (Flow + DTE) + calculadora integrada.
5. **Semana 5:** monitoreo + revisores + deploy a Railway.
6. **Semana 6:** conseguir/onboardear **1 cliente real** y cobrar. Documentar cada paso en `docs/rutas/`.

## 6. Definición de "ruta lista" (Definition of Done)
- [ ] Un cliente final escribe por WhatsApp y el agente resuelve o deriva bien.
- [ ] El operador (tú) ve todo en el dashboard, en vivo.
- [ ] El cliente ve su agente y puede poner un reclamo en su portal.
- [ ] Hay una suscripción activa en Flow y se emitió boleta/factura.
- [ ] Pasa evals, seguridad y compliance.
- [ ] Está desplegado y monitoreado.
- [ ] **Está documentado** paso a paso (para clonar la ruta 2).

## 7. Cómo se extiende después
- **Ruta 2, 3…** en Mastra: se clona esta ruta cambiando agente + tools (reusa canal, cobros, portal, monitoreo).
- **n8n:** para sumar tus agentes ya existentes sin reescribir, se registran en el dashboard como "agentes externos" (los orquesta el operador, corren en n8n). Así conviven Mastra (nativo) y n8n (heredado).
- **Multiagente / plataforma para otros creadores:** solo cuando varias rutas estén validadas y cobrando. Ahí se prende el multi-tenant (ver `docs/12`, `system-agents/`).

## 8. Documentación viva
Cada ruta que construyas se documenta en `docs/rutas/ruta-XX-<nombre>.md` con: qué hace, tools, evals, precio (de la calculadora), y aprendizajes. Así se arma solo el "manual completo de agentes" que sentías que no existía.
