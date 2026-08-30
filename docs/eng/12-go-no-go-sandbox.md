# GO / NO-GO · Sandbox

## GO para desarrollo local

- RLS y aislamiento se verifican con la suite de Postgres.
- API keys y adjuntos permanecen cifrados/privados.
- Cobros, DTE e instancias funcionan solo como sandbox controlado.
- El gating impide activar una instancia sin suscripción activa que la cubra.

## NO-GO para producción

- El cron firmado de morosidad y la suspensión remota en Railway siguen pendientes; sandbox solo actualiza el estado local tras el período de gracia.

- Falta configurar Flow real y validar su consulta de estado firmada.
- Falta configurar LibreDTE, emisor tributario, certificados y almacenamiento privado de PDF/XML.
- Falta Railway real y una integración que suspenda el servicio remoto, no solo el estado en Kaudal.
- Falta habilitar/auditar Supabase Realtime para tickets y uso en vivo.
- Falta CSP de producción, MFA de operador, proxy confiable para IP y rate limit distribuido.

No se debe cobrar ni emitir documentos tributarios reales hasta cerrar todos los puntos NO-GO.
