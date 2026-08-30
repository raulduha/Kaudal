# 18 · Definición del Producto (decisiones cerradas)

> Este documento manda sobre los demás si hay contradicción. Captura las decisiones tomadas para que el proyecto no se vuelva a abrir.

## 1. Qué es Kaudal (una frase)
**La capa que toma un agente de IA que YA corre (n8n, Mastra, código), estima su costo, y te ayuda a cobrarlo y desplegarlo online — hecha para Chile.** No es un motor de agentes. Es lo que va *alrededor* del agente para convertirlo en un servicio pagado.

## 2. Para quién
Solo para el operador (tú) por ahora. Multi-tenant (que otros creadores paguen) es Fase futura; no se construye hasta validar.

## 3. Los 4 pilares (esto es el producto)
1. **Registrar** un agente que ya corre → por su endpoint/webhook. NO lo hosteamos ni ingerimos su código; lo envolvemos.
2. **Estimar costo** → con la **calculadora** (usos/mes × modelo → costo → precio sugerido). Estimado, no medido (no somos proxy del modelo todavía).
3. **Conectar el cobro** → suscripción **Flow** + boleta/factura vía proveedor DTE. CLP + IVA.
4. **Conectar el despliegue online** → ayudar a dejarlo accesible (canal/URL) y monitoreado (vivo/caído).

## 4. Lo que NO es (decidido)
- NO es un motor de agentes (usas n8n/Mastra).
- NO mide el costo real por proxy (eso es Fase futura si se justifica).
- NO hostea código arbitrario del agente.
- NO es multi-tenant de pago aún.
- NO tiene subagentes autónomos que venden/marketing solos (van semi-automáticos, con tu aprobación, y después).

## 5. Runtime (híbrido)
- **Ruta 1 (flagship):** nativa en **Mastra**, visual y con cobros (ver `docs/17`). Es la prueba e2e.
- **n8n:** para registrar tus agentes ya existentes (como notas→Excel) sin reescribir.
- Migrar de n8n a Mastra solo lo de alto volumen, cuando se justifique.

## 6. Stack cerrado
- Front: Next.js. Back: NestJS. Datos: Supabase/Postgres. Agentes flagship: Mastra.
- Cobro: **Flow** (suscripción) + proveedor **DTE** (LibreDTE/otro) para boleta/factura.
- Estimación de costo: la **calculadora** (`tools/calculadora-agentes.html`), integrada como pantalla.
- Host: local/Raspberry ahora → **Railway** al primer cliente pagando (ver `docs/16`).

## 7. El hito que importa (no perderlo de vista)
**Un agente tuyo, registrado en Kaudal, con su costo estimado, cobrado por Flow con boleta emitida, a un cliente real.** Antes de eso, todo lo demás es preparación. Después de eso, se replican rutas y recién se piensa en multi-tenant.

## 8. Alcance de diseño actual (qué artboards importan hoy)
Del prompt de diseño (`prompts/claude-design-prompt.md`), prioriza:
- **C1** (Home operador), **C4** (registrar agente/cliente), **C5** (cobros), **D1/D2** (portal + reclamos del cliente), y la **calculadora** como pantalla.
- Deja para después: B1-B3 (multi-tenant), C6 (marketing autónomo), y el pipeline C3 completo.

## 9. Confidencialidad bilateral (los dos lados protegidos)
Regla: **el operador no ve lo del cliente, y el cliente no ve lo del operador.**

- **Lo del cliente (protegido del operador):** su **API key** se recibe cifrada, se guarda cifrada (AES-GCM/libsodium con clave del servidor o KMS), se descifra SOLO en el instante de la llamada al modelo, y **nunca** se muestra ni se loguea. El operador ve solo la key **enmascarada** (ej: `sk-...ab12`) y el **uso/costo**, jamás la key completa.
  - *Honestidad técnica:* como el agente (que corre el operador) usa la key, cero-conocimiento absoluto no es posible; lo que se garantiza es **exposición mínima** y no visibilidad directa. Esto se documenta al cliente con transparencia.
- **Lo del operador (protegido del cliente):** el cliente **no ve** el código Mastra, los prompts, el workflow ni la lógica interna del agente. Ve una **caja negra útil**: su agente, qué **modelo** usa, su **uso/costo estimado**, sus **límites**, y sus **reclamos**. Nada de la "receta".

## 10. Avisos al cliente (transparencia de uso)
El portal del cliente debe mostrar/avisar siempre:
- **Qué modelo** usa su agente (ej: "Claude Sonnet").
- **Los límites que él configuró** en su API key (límite de gasto / rate) y una **advertencia cuando se acerque al tope** ("vas en el 80% de tu límite mensual").
- Su **uso y costo estimado** al día, para que no se lleve sorpresas.
