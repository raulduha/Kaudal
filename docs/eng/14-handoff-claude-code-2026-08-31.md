# Relevo de implementación — 2026-08-31

Lee este documento antes de continuar Kaudal con Claude Code. Resume el estado efectivo del repositorio; no reemplaza `TASKS.md`, que sigue definiendo el orden de trabajo.

## Estado actual

- Repositorio Git inicializado, rama `main` publicada en `https://github.com/raulduha/Kaudal.git`.
- App Next.js bajo `app/`; Supabase local y sus migraciones ya aplicadas para desarrollo.
- El panel del operador, el portal cliente, RLS, API keys cifradas, agentes, ingestión de uso, tickets, cobros sandbox, instancias y rentabilidad existen y se probaron localmente.
- Cuentas locales de demostración fueron creadas fuera del repositorio. No documentar, exponer ni modificar contraseñas o secretos de `.env.local`.
- La interfaz incluye ayuda contextual `(i)` en agentes, cobros, instancias y calculadora. `/docs` es el manual navegable dentro del software, con pestaña de caso completo E2E.

## Decisión de producto que NO se debe cambiar

Kaudal es el panel de control; los agentes son workflows n8n, Mastra o código propio administrados por el operador. Kaudal no debe ejecutar ni proxyear la lógica del agente.

Modelo comercial acordado:

1. El operador crea el cliente y configura el workflow.
2. El cliente aporta su propia API key de IA, almacenada cifrada. El consumo de tokens se cobra al cliente desde su proveedor de IA.
3. El cliente paga al comercio del operador por Flow para cubrir mantención, infraestructura, soporte y margen.
4. Solo un pago confirmado puede habilitar la instancia. No crear una instancia dedicada antes de pagar.
5. Flow descuenta su comisión y liquida el saldo a la cuenta bancaria configurada por el operador. Kaudal no implementa reparto automático de fondos ni pago automático de Railway.

No prometer operación con caja cero: aunque Flow confirme un pago en línea, el abono bancario puede tener desfase y Railway/VPS suele exigir un medio de pago del operador.

## Qué está probado localmente

Ejecutar desde `app/`:

```powershell
npm run typecheck
npm test
npx vitest run tests/cobros-sandbox.test.ts tests/instancias-rentabilidad.test.ts --reporter=verbose
npx vitest run tests/rls/10-instancias-gating.test.ts --reporter=verbose
```

En la última verificación (2026-08-31): typecheck correcto; firma/IVA sandbox y rentabilidad (3 pruebas) correctas; gating de instancias en Postgres/RLS (2 pruebas) correcto.

El sandbox implementa:

- Webhook HMAC local que marca una suscripción pagada o morosa.
- Cinco días de gracia para impagos.
- RPC atómico que suspende instancias morosas vencidas.
- Reactivación de estado al recibir pago sandbox.
- Trigger de base que impide activar una instancia sin suscripción activa que cubra su costo.

## Bloqueadores de producción — NO hacer un GO todavía

El código de Flow es sandbox: `app/src/app/api/webhooks/flow/route.ts` valida una firma de prueba pero no consulta ni procesa el proveedor real. Por tanto, un pago real hoy NO crea ni activa infraestructura real.

Falta antes del primer cobro real:

1. Integrar Flow real: credenciales como secretos, creación de cobro/suscripción, validación oficial, consulta de estado e idempotencia transaccional.
2. Integrar DTE/boleta o factura con proveedor y credenciales tributarias.
3. Integrar Railway/VPS: crear, detener y reactivar una instancia real; no solo cambiar su estado en DB.
4. Cron alojado y firmado para suspensión real de morosos.
5. Email transaccional y registro idempotente de notificaciones: pago, fallo, inicio/fin de gracia y reactivación. No hay Resend/SendGrid/Postmark conectado.
6. Configurar Supabase Cloud (sin auto-signup), dominio HTTPS, secretos de producción, proxy confiable/rate limiting distribuido, MFA de operador y CI.
7. Ejecutar el endurecimiento de Fase 12 y la revisión manual de accesibilidad.

Los detalles y evidencia anterior están en `docs/eng/13-reporte-go-no-go-2026-08-30.md` y `docs/guia-flujo-completo.md`.

## Últimos cambios de UI

- `/docs`: pestañas “Cómo funciona”, “Agentes y claves”, “Cobros”, “Operación”, “Caso completo” y “Producción”.
- `/calculadora`: cada entrada tiene ayuda `(i)`; sus números solo simulan una cotización, no alteran tarifas ni cobran al cliente.
- `/uso` y `/ajustes` existen y ya no rompen los enlaces del menú.
- Login usa `FormData` para que credenciales autocompletadas por el navegador sí se envíen.
- CSP permite `unsafe-eval` solo en desarrollo para Next Fast Refresh; producción no debe incluirlo.

## Próximo trabajo

Respeta la primera tarea sin marcar de `TASKS.md`. Al tocar pagos, infraestructura, auth, RLS o secretos, haz revisión de seguridad y no uses datos/credenciales reales en tests. Para preparar producción, primero construir staging y pruebas end-to-end con Flow sandbox y un proveedor de infraestructura de prueba; no conectar llaves productivas hasta completar los bloqueadores anteriores.
