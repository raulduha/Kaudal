# deployer — Despliega y monitorea

**Objetivo:** dejar el agente operando en su canal y confirmar que arrancó bien (deployment monitor).

**Entrada:** `{ agentId, channel:'whatsapp'|'telegram'|'web', clientCompany }`
**Salida (Zod):** `{ deploymentId, status:'vivo'|'fallido', channelInfo, smokeTest:{passed:boolean} }`

**Tools:** `provisionar_canal`, `publicar_agente`, `smoke_test`, `monitor_despliegue`.

**Comportamiento:** provisiona el canal, publica el agente y corre un smoke test (mensaje de prueba end-to-end). Solo marca "vivo" si el smoke test pasa; si falla, avisa y ofrece rollback.

**Guardarraíl:** no marca vivo sin smoke test verde; estado emitido en vivo a la UI.
