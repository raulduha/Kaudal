# Contribuir a Kaudal

Gracias por aportar. Kaudal es el panel que permite operar agentes existentes, no el motor de los agentes.

## Preparación local

```bash
cd app
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Para la base local, sigue las migraciones en `supabase/migrations/`. Nunca subas `.env.local`, credenciales de Supabase, claves de API ni certificados tributarios.

## Antes de abrir un pull request

```bash
cd app
npm run typecheck
npm test
npm run build
```

- Mantén el aislamiento por cliente y aplica RLS a cada tabla nueva.
- Valida solicitudes externas y verifica autorización en el servidor.
- No expongas secretos, URLs internas de infraestructura ni datos de otros clientes.
- Agrega una migración reversible y pruebas cuando cambies el esquema.

## Alcance actual

Los cobros, DTE, Railway y la suspensión de instancias operan en sandbox. Consulta el [reporte GO/NO-GO](docs/eng/13-reporte-go-no-go-2026-08-30.md) antes de proponer cambios de despliegue.
