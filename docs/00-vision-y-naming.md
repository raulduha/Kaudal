# 00 · Visión y Naming

## 1. En una frase
**Kaudal es el "ERP de agentes de IA" para PYMES chilenas: una plataforma donde el dueño de la empresa arma, ve y controla una cuadrilla de agentes que trabajan solos —atención, ventas, cobranza, documentos y marketing— todo desde un panel visual, seguro y auditable.**

## 2. El problema (real y probado)
Las PYMES chilenas ya sienten que "la IA sirve", pero:
- Contratan herramientas sueltas (un chatbot por acá, un generador de contenido por allá) que no conversan entre sí.
- No tienen quién programe ni mantenga integraciones.
- No confían en poner sus datos en cajas negras.
- No ven lo que la IA hace: no hay trazabilidad ni control.

Lo que ya funciona en el mercado (y por eso partimos por ahí) son casos **acotados y medibles**: responder WhatsApp, calificar leads, cobrar, leer documentos, y crear contenido de marketing. Kaudal empaqueta esos casos probados en una sola plataforma bonita y confiable.

## 3. La propuesta de valor
> "Contrata a tu primer equipo de IA en una tarde. Ve exactamente lo que hace. Págalo como un servicio, no como un proyecto eterno."

Tres promesas:
1. **Rápido:** agentes listos que se activan con clics, no con código.
2. **Transparente:** cada agente y workflow es visible y descargable (ver `08-contenido-descargable.md`).
3. **Confiable:** seguridad de nivel empresa y cumplimiento de datos de Chile por defecto.

## 4. A quién le vendemos
PYMES chilenas de 5 a 200 personas, en rubros donde los agentes ya rinden hoy:
- **Retail / e-commerce:** atención, postventa, reclamos, recomendación.
- **Servicios (clínicas, estudios, inmobiliarias, educación):** agenda, documentos, cobranza.
- **Distribución / B2B:** cotizaciones, seguimiento de pedidos, cobranza.
- **Agro / exportadoras:** documentación y trazabilidad (el caso de la referencia OxideLabs).

El comprador es el **dueño o gerente**, no el área de TI. Por eso todo tiene que verse simple y bonito.

## 5. Naming

### Nombre de trabajo: **Kaudal**
- **Por qué:** de "caudal" (flujo/volumen de agua) — evoca el **flujo** de trabajo (como los nodos de n8n), es 100% chileno/latino, se pronuncia fácil, y con "K" se ve moderno y es más fácil de registrar como marca y dominio.
- **Tagline:** *"El caudal de agentes que mueve tu empresa."*
- **Concepto de marca:** el agua que fluye = el trabajo que se mueve solo. La empresa "abre la llave" y los agentes fluyen.

### Shortlist alternativo (por si Kaudal no cuadra)
| Nombre | Idea | Tono |
|---|---|---|
| **Kaudal** | Caudal/flujo de trabajo | Moderno, local, fluido |
| **Faena** | La "pega"/turno de trabajo chileno | Cercano, industrioso |
| **Cuadrilla** | Tu equipo/crew de agentes | Humano, de equipo |
| **Nodo** | Nodos de un workflow (guiño a n8n) | Técnico, minimal |
| **Zafra** | Cosecha/temporada (guiño agro) | Cálido, de resultados |
| **Orbe** | Todo tu negocio en una órbita | Abstracto, premium |

### Cómo cambiar el nombre en un solo lugar
Todo el código lee la marca desde `brand/brand.config.ts`. Cambiar `name`, `domain` y `tagline` ahí propaga el nombre a UI, correos y documentos. **No hardcodear "Kaudal" en componentes.**

## 6. Diferenciación vs. lo que existe
- **vs. n8n / Make / Zapier:** ellos son para gente técnica y son "automatización". Kaudal es **agentes con criterio** (deciden, no solo ejecutan) y está en español para el dueño, no para el ingeniero.
- **vs. chatbots sueltos:** Kaudal es una **plataforma multi-agente** con memoria compartida, panel único y auditoría.
- **vs. desarrollo a medida:** Kaudal es **producto** (rápido y económico) con opción de licencia/código para quien lo quiera (ver modelo de cobro).

## 7. Principios de producto
1. Si el dueño no lo entiende en 30 segundos, está mal diseñado.
2. Mostrar siempre qué hizo el agente y por qué (transparencia radical).
3. Nunca pedir que el cliente "programe". Configurar ≠ programar.
4. Cada capacidad nueva debe apoyarse en la plataforma existente (pricing de suite, ver `05`).
5. Seguridad y datos: el cliente es dueño de sus datos, siempre.
