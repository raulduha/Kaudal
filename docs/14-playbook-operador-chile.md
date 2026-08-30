# 14 · Playbook del Operador de Agentes (Chile)

> La guía completa que sentías que no existe: cómo tomar un agente (como tu n8n de notas→Excel) y convertirlo en un servicio que un cliente paga, de principio a fin, en Chile. Paso a paso, con y sin empresa.

## Mentalidad
No vendes "un agente" ni "IA": vendes un **resultado** ("recibe tus facturas a mano y te devuelvo el Excel listo, todos los días"). El cliente paga por el problema resuelto, no por la tecnología. Todo lo demás de esta guía apoya eso.

---

## Paso 0 · Antes de vender: ¿cómo facturas?
Dos caminos legales en Chile:
- **Sin empresa (persona natural):** puedes emitir **boleta de honorarios** por servicios. Simple para partir. Tiene retención de impuesto y tope práctico. Sirve para tus primeros 1-3 clientes.
- **Con empresa:** constituir por **"Empresa en un Día"** (registrodeempresas... del Estado) — rápido y barato (una EIRL o SpA). Te habilita **factura electrónica**, más serio para clientes empresa y para escalar. Necesitas iniciar actividades en el SII.
> Recomendación: parte con **boleta de honorarios** para validar; **constituye SpA** apenas tengas 2-3 clientes recurrentes o un cliente que exija factura.

## Paso 1 · Empaqueta el agente como oferta
Por cada agente define, en una página:
- **Resultado** que entrega (en la voz del cliente).
- **Qué necesita del cliente** (accesos, ejemplos, un número de WhatsApp).
- **Qué NO hace** (límites claros — evita reclamos).
- **Nivel de servicio** simple: horario, tiempo de respuesta ante falla.
Plantilla: usa la ficha del agente (`templates/agents/*.json`) como base técnica y traduce a esta página comercial.

## Paso 2 · Precio (decisión dura, con método)
No inventes el precio. Calcula:
1. **Costo variable/mes:** consumo de modelo (tokens × precio) + infra + pasarela (Flow ~comisión) + tu tiempo de soporte.
2. **Piso:** costo × 3 como mínimo (deja margen para soporte e imprevistos).
3. **Modelo de cobro:** suscripción mensual (recomendado, ingreso recurrente) + un **setup inicial** único por implementación.
4. **Ancla al valor:** ¿cuánto le ahorra/gana al cliente? Cobra una fracción de eso, no de tu costo.
Rangos de partida para PYME Chile (ajústalos): setup $200.000–$800.000 + IVA; mensual $80.000–$400.000 + IVA según volumen. (Ver `docs/05` para el detalle.)

## Paso 3 · Contrato / términos (protégete)
Un documento simple (no necesitas abogado caro para partir, pero sí para el modelo base):
- Alcance (qué hace el agente y qué no), datos, confidencialidad.
- **Datos personales:** el cliente es responsable; tú eres encargado de tratamiento (Ley 19.628 / 21.719). Deja por escrito que los datos son del cliente. Ver `docs/04`.
- Precio, forma de pago, reajuste, término.
- Límite de responsabilidad (la IA puede errar; hay revisión humana para lo crítico).

## Paso 4 · Onboarding del cliente (tú le creas la cuenta)
El cliente NO se inscribe: tú le creas el acceso al portal.
1. Reúne accesos y ejemplos reales (como las fotos de notas de la fábrica).
2. Configura el agente en n8n con SUS datos.
3. Registra el agente y el cliente en Kaudal (doc 15).
4. Conecta su canal (WhatsApp/Telegram).
5. Muéstrale su portal.

## Paso 5 · Despliega y prueba (e2e)
- **Smoke test:** una interacción real de punta a punta antes de decir "está vivo".
- **Revisión:** seguridad (secretos, accesos), calidad (que no invente), datos (consentimiento del canal).
- Deja el monitoreo prendido (heartbeat + fallos).

## Paso 6 · Cobra (Flow + boleta/factura)
1. Crea la **suscripción en Flow** para el cliente (cargo mensual automático).
2. Al confirmarse el pago (webhook Flow), **emite boleta/factura** por el proveedor DTE.
3. Registra todo en Kaudal (`cobros`). Envía el comprobante.
> Nunca cobres "por fuera" sin documento: en Chile el SII te lo exige y da seriedad al cliente.

## Paso 7 · Soporte y evolución
- Define un canal de soporte y un tiempo de respuesta que puedas cumplir.
- Revisa la bandeja de reclamos del portal.
- Mide: ¿el agente resuelve solo? ¿el cliente lo usa? Mejora el prompt/flujo.
- Sube precio o agrega agentes cuando el valor esté probado (pricing de suite: el 2° agente al mismo cliente es más barato de operar).

## Paso 8 · Escala con orden
- Cada agente nuevo = una ficha (paso 1) + registro en Kaudal + suscripción.
- Reutiliza plantillas (`templates/`) para no partir de cero.
- Cuando un agente tenga mucho volumen, evalúa migrarlo de n8n a Mastra (híbrido).

---

## Checklist rápido por cliente nuevo
- [ ] Empaqué la oferta (resultado + límites).
- [ ] Definí precio (costo × 3, + setup).
- [ ] Firmé términos (datos, alcance, responsabilidad).
- [ ] Configuré el agente en n8n con sus datos.
- [ ] Lo registré en Kaudal y le creé el portal.
- [ ] Conecté su canal e hice smoke test.
- [ ] Creé la suscripción en Flow.
- [ ] Emití boleta/factura por el proveedor DTE.
- [ ] Prendí el monitoreo y le expliqué su portal.

## Errores comunes (que te van a costar plata)
1. Cobrar por costo y no por valor → dejas plata en la mesa.
2. No poner límites por escrito → reclamos y scope creep.
3. Prometer autonomía total → un error del agente sin revisión humana te quema con el cliente.
4. No emitir documento tributario → problema con el SII y desconfianza.
5. Construir plataforma antes de tener clientes → meses sin facturar.
