# 12 · Subagentes del Sistema (el corazón de Kaudal)

> Esto NO son agentes de negocio (los que arma el creador). Son **subagentes internos de la plataforma, que viven en tu código** (backend NestJS + Mastra) y toman *cualquier* agente que un creador construya para **venderlo, cobrarlo, hacerle marketing, revisarlo y desplegarlo** hasta dejarlo operando solo. Son el diferenciador de Kaudal: el creador arma la IA, y Kaudal hace todo el trámite e2e.

## 1. Principio: la plataforma es horizontal
Kaudal sirve para **cualquier agente**, no para casos "básicos". El valor no está en un catálogo cerrado de agentes, sino en la **maquinaria que industrializa** cualquier agente: marca → cobro → canal → revisión → despliegue → operación. Esa maquinaria son los subagentes del sistema.

## 2. Mapa de subagentes del sistema
Corren orquestados por un **Orchestrator** dentro del pipeline de despliegue e2e (pantalla C3). Cada uno es un agente Mastra con herramientas acotadas y salida estructurada (Zod), y deja auditoría.

| Subagente | Rol (qué automatiza) | Fase del pipeline | Corre en |
|---|---|---|---|
| `orchestrator` | Coordina todo el pipeline e2e, maneja estado y reintentos | Todas | Backend (Mastra workflow) |
| `sales-closer` | Vende: arma la oferta, cotiza, responde objeciones, cierra a la empresa-cliente | Venta | Backend |
| `billing-agent` | Cobra: genera el cobro, links de pago, controla estado, doble cobro | Cobro | Backend + pasarela |
| `brand-marketing` | Marketing: naming, brand clearance, social card, copys y landing del agente | Marca/Marketing | Backend |
| `deployer` | Despliega: provisiona canal, publica el agente, monitorea el arranque | Despliegue | Backend + infra |
| `reviewer-security` | Revisa seguridad antes de salir vivo (secretos, aislamiento, webhooks) | Revisión | Backend |
| `reviewer-quality` | Revisa calidad del agente con evals antes de producción | Revisión | Backend |
| `reviewer-compliance` | Revisa cumplimiento de datos (Chile) y consentimiento del canal | Revisión | Backend |

> Los archivos de especificación de cada uno están en `system-agents/`. Los subagentes de *construcción* (Claude Code) siguen en `.claude/agents/` — no confundir: esos te ayudan a programar Kaudal; estos operan dentro de Kaudal.

## 3. Detalle de cada subagente

### 3.1 `orchestrator` — el capataz
- **Entrada:** un agente recién creado + config del creador.
- **Hace:** ejecuta el pipeline (venta → marca → cobro → canal → revisión → deploy → vivo), en paralelo lo que se puede, con reintentos y estado durable (Mastra Workflows).
- **Salida:** estado del despliegue en vivo para la pantalla C3.

### 3.2 `sales-closer` — vende
- **Hace:** genera la propuesta comercial del agente para la empresa-cliente (usando el modelo de cobro), responde dudas, maneja objeciones y confirma el cierre.
- **Tools:** `generar_propuesta`, `cotizar`, `registrar_cierre`, `crear_empresa_cliente`.
- **Guardarraíl:** no promete lo que el agente no hace; el creador aprueba antes de enviar.

### 3.3 `billing-agent` — cobra
- **Hace:** el **doble cobro** — la suscripción del creador a Kaudal y el cobro del creador a su empresa-cliente. Genera links de pago (Mercado Pago/Webpay), controla estado, reintentos y recibos. CLP + IVA.
- **Tools:** `generar_cobro`, `link_pago`, `conciliar_pago`, `emitir_recibo`.
- **Guardarraíl:** idempotencia; nada se cobra dos veces; todo auditado.

### 3.4 `brand-marketing` — marketing y marca
- **Hace:** lo que ya viste en el feed: **naming marketing**, **brand clearance** (revisa que el nombre/marca no choque), **social card** (pieza para redes), más copys y una landing del agente.
- **Tools:** `proponer_naming`, `chequear_marca`, `generar_social_card`, `generar_landing`, `generar_copys`.
- **Guardarraíl:** borradores con aprobación humana; respeta consentimiento y frecuencia.

### 3.5 `deployer` — despliega y monitorea
- **Hace:** provisiona el canal (WhatsApp/Telegram), publica el agente, y corre el **deployment monitor** (verifica que arrancó bien, hace smoke test).
- **Tools:** `provisionar_canal`, `publicar_agente`, `smoke_test`, `monitor_despliegue`.
- **Guardarraíl:** si el smoke test falla, no marca "vivo" y avisa; rollback disponible.

### 3.6 `reviewer-security` / `reviewer-quality` / `reviewer-compliance` — revisores
- **security:** valida aislamiento por tenant, secretos server-side, firma de webhooks, permisos de tools.
- **quality:** corre las evals del agente (Mastra) y bloquea si no pasa el mínimo.
- **compliance:** verifica datos personales (Ley 19.628 / 21.719) y consentimiento del canal.
- **Guardarraíl:** son bloqueantes: si un revisor falla, el agente NO sale vivo.

## 4. Cómo se ven en la UI
El pipeline e2e (pantalla C3) muestra cada subagente como una fila con su estado en vivo (los chips: *ya trabajando*, *actualizado*, *ha terminado*, *con problema*). Es exactamente el feed que ya tenías: "Naming marketing — actualizado", "Brand clearance — ya trabajando", "Social card — ha terminado", "Deployment monitor — ha terminado".

## 5. Extensibilidad
Nuevos subagentes del sistema se agregan implementando la misma interfaz (entrada, tools, salida Zod, auditoría) y registrándolos en el orchestrator. Así Kaudal crece sin tocar el núcleo.
