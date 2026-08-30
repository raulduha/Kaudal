# 03 · Agentes en Kaudal

Kaudal es **horizontal**: sirve para construir **cualquier** agente. No es un catálogo cerrado de "chatbots de soporte". Hay dos mundos:

- **Agentes de negocio** → los arma el *creador*, para cualquier caso. Kaudal no los limita.
- **Subagentes del sistema** → los de la plataforma que venden, cobran, hacen marketing, despliegan y revisan *cualquier* agente. Son el diferenciador. Ver `docs/12-subagentes-del-sistema.md` y `system-agents/`.

---

## PARTE A · Agentes de negocio: la plataforma construye cualquiera

El creador arma el agente que quiera en el Constructor (canvas). Para no partir de cero, Kaudal ofrece una **galería de verticales nicho ya validadas en el mercado** — casos donde los agentes hoy generan plata de verdad, no ejemplos genéricos. Son plantillas y punto de partida, no un límite.

### Madurez: 🟢 Validado en producción · 🟡 Emergente · 🔵 Experimental

| Vertical (nicho validado) | Qué hace el agente | Madurez |
|---|---|---|
| **AI SDR / prospección outbound** | Investiga leads, escribe secuencias personalizadas, agenda reuniones (estilo 11x/Artisan) | 🟢 |
| **Recepcionista de voz IA** | Contesta llamadas entrantes, agenda y responde FAQ por voz (clínicas, restoranes, servicios) | 🟢 |
| **Procesamiento de facturas / AP (OCR + datos)** | Lee facturas/notas —incluso a mano— y genera reporte/registro (tu caso `lector-notas`) | 🟢 |
| **Revisión de contratos / legal** | Marca cláusulas de riesgo, compara contra plantilla, resume | 🟢 |
| **Soporte con RAG sobre documentos** | Responde con la base real de la empresa, cita fuente, deriva si duda | 🟢 |
| **Agendamiento / appointment setter** | Coordina, confirma y reagenda citas por chat | 🟢 |
| **Scribe clínico / notas médicas** | Transcribe y estructura la consulta en ficha | 🟡 |
| **Enriquecimiento de catálogo e-commerce** | Genera fichas de producto, atributos y SEO a escala | 🟡 |
| **Reputación / reseñas** | Responde reseñas, detecta patrones, alerta crisis | 🟡 |
| **Calificación de leads inmobiliarios** | Filtra y califica interesados, agenda visitas | 🟡 |
| **Screening de reclutamiento** | Preselecciona candidatos contra criterios | 🟡 |
| **Conciliación financiera** | Cruza pagos, cartolas y facturas, marca diferencias | 🟡 |
| **Intake de siniestros / seguros** | Recibe y estructura el reporte inicial de un siniestro | 🔵 |
| **RevOps / higiene de CRM** | Limpia, dedup y enriquece datos del CRM | 🔵 |

> Esta lista es inspiración y plantillas de arranque. El punto de Kaudal es que **cualquiera** de estos —o uno nuevo— se arma en el canvas y se industrializa con los subagentes del sistema.

### Patrón común de todo agente de negocio
1. **Identidad** (nombre, tono, idioma). 2. **Instrucciones** (qué hace y qué NO). 3. **Herramientas** (acciones validadas con Zod, acotadas al `orgId`). 4. **Memoria** (Mastra). 5. **Umbral de confianza** (resolver vs. derivar). 6. **Evals** (calidad medible). 7. **Auditoría** (`agent_runs`).
Plantilla en `templates/agents/_plantilla.json`; ejemplos reales incluyendo `lector-notas.json` (facturas a mano → Excel).

---

## PARTE B · Subagentes (dos familias, no confundir)

### B1. Subagentes del SISTEMA (runtime, en el producto) — el diferenciador
Viven en `system-agents/` y operan dentro de Kaudal para llevar cualquier agente a vivo: `orchestrator`, `sales-closer` (vende), `billing-agent` (cobra), `brand-marketing` (naming/brand clearance/social card), `deployer` (despliega/monitorea), `reviewer-security`, `reviewer-quality`, `reviewer-compliance`. Detalle en `docs/12`.

### B2. Subagentes de CONSTRUCCIÓN (Claude Code, para desarrollar Kaudal)
Viven en `.claude/agents/` y te ayudan a programar la plataforma de forma segura: `security-auditor`, `code-reviewer`, `db-guardian`, `compliance-cl`, `deployment`, `qa-tester`, `devops-infra`, `agent-builder`, `marketing-deployer`, `docs-writer`. Índice en `.claude/agents/README.md`.
