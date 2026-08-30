# Reporte GO / NO-GO · 2026-08-30

## Decisión

**GO para desarrollo sandbox local. NO-GO para el primer cliente real o cobros reales.**

## Evidencia verificada

- Supabase local tiene RLS, aislamiento de clientes y gating de instancias.
- La instancia no puede activarse sin una suscripción activa que la cubra.
- El ciclo sandbox de impago conserva cinco días de gracia; un endpoint interno firmado suspende las instancias vencidas de forma atómica en PostgreSQL. Pago las reactiva.
- El portal usa `instancias_publicas`, que solo entrega al cliente el estado del servicio; no entrega URL ni identificadores del proveedor.
- `npm run typecheck` pasó el 2026-08-30.
- Suite completa verificada por bloques: **145/145 pruebas verdes** (116 de RLS/auditoría y 29 de flujos HTTP, tickets, uso y sandbox).
- Cabeceras verificadas por HTTP local: CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` y `Permissions-Policy`.

## Revisión de seguridad y correctitud

- Los endpoints de operador comprueban sesión, rol y mismo origen; los webhooks y el cron sandbox requieren HMAC.
- No se detectó uso de `eval` ni renderizado HTML inseguro en `app/src`.
- Se corrigió una carrera entre un pago entrante y el cron de morosidad: la suspensión se decide y aplica en una única función transaccional de PostgreSQL.
- `authenticated` no tiene permiso de ejecutar la función interna de suspensión; solo `service_role`.

## Accesibilidad: revisión estática

- El formulario de instancia tiene etiquetas, mensajes de estado y controles de al menos 44 px para su acción principal.
- La navegación base conserva skip link y focos visibles.
- Verificación manual local: Login carga con título, etiquetas y controles semánticos; el foco por teclado avanza en orden Correo → Contraseña → Entrar. A 320 px no presenta desborde horizontal.
- Pendiente antes de producción: recorrido autenticado completo, lector de pantalla y zoom al 200 % en las pantallas nuevas de Instancias y Portal.

## Bloqueadores de producción

1. Configurar Flow real, validar sus callbacks contra su API/firmas oficiales y manejar idempotencia del proveedor.
2. Configurar emisor DTE, certificados, LibreDTE y resguardo de PDF/XML.
3. Configurar Railway y un cron hospedado que invoque el endpoint firmado; la suspensión debe apagar realmente la infraestructura remota.
4. Configurar y auditar Supabase Realtime para tickets y uso en vivo.
5. Completar hardening operativo: CSP validada en el despliegue, MFA de operador, proxy confiable de IP y rate limiting distribuido.
6. Completar pruebas manuales de accesibilidad antes del primer cliente: teclado, lector de pantalla y zoom al 200 %.

## Operación sandbox

- Usa `FLOW_SANDBOX_WEBHOOK_SECRET` para firmar eventos de prueba.
- Usa `SUSPENSION_CRON_SECRET` para firmar `POST /api/internal/suspender-morosos` con el header `x-kaudal-signature` y el mensaje `suspender-morosos`.
- Nunca reutilices secretos sandbox en Flow, Railway o Supabase de producción.
