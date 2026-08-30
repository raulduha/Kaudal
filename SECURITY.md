# Política de seguridad

No publiques vulnerabilidades, secretos, tokens, RUTs ni información de clientes en issues públicos.

Para reportar un problema de seguridad, abre un canal privado con el mantenedor e incluye pasos mínimos de reproducción, impacto y evidencia. No adjuntes credenciales reales.

## Principios del proyecto

- API keys cifradas y nunca expuestas al frontend.
- RLS y aislamiento por cliente en Supabase.
- Acciones sensibles auditables.
- Webhooks y tareas internas autenticados mediante firma.

El estado de preparación se mantiene en [docs/eng/13-reporte-go-no-go-2026-08-30.md](docs/eng/13-reporte-go-no-go-2026-08-30.md).
