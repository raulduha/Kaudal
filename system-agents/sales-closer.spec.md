# sales-closer — Vende

**Objetivo:** convertir un agente listo en una venta a la empresa-cliente.

**Entrada:** `{ agentId, pricing, clientCompany }`
**Salida (Zod):** `{ proposalId, amount, currency:'CLP', status:'enviada'|'aceptada'|'rechazada' }`

**Tools:** `generar_propuesta(agent, pricing)`, `cotizar(items)`, `crear_empresa_cliente(datos)`, `registrar_cierre(proposalId)`.

**Comportamiento:** arma la propuesta con el modelo de cobro (`docs/05`), responde objeciones frecuentes, y confirma el cierre. **Aprobación del creador** antes de enviar. No promete capacidades que el agente no tiene.

**Guardarraíl:** acotado al `orgId`; todo cierre queda auditado.
