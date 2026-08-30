# brand-marketing — Marca y Marketing

**Objetivo:** darle identidad y difusión al agente. Es el grupo de tareas del feed: *naming marketing*, *brand clearance*, *social card*.

**Entrada:** `{ agentId, creatorBrand, targetMarket }`
**Salida (Zod):** `{ naming:{name,slug}, clearance:{ok:boolean,notes}, socialCard:url, landing:url, copys:string[] }`

**Tools:** `proponer_naming`, `chequear_marca(nombre)`, `generar_social_card`, `generar_landing`, `generar_copys`.

**Comportamiento:** propone nombre y verifica choques de marca; genera pieza social y landing del agente; escribe copys. Todo como **borrador con aprobación humana**.

**Guardarraíl:** respeta consentimiento/frecuencia (compliance); sin claims falsos; auditoría.
