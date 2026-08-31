# Kaudal

> El panel para convertir agentes de IA existentes en un servicio operable, medible y cobrable en Chile.

Kaudal registra agentes que ya corren —por ejemplo en n8n—, organiza clientes, estima uso y costo, centraliza soporte y prepara el ciclo de cobro. No reemplaza el motor del agente: lo envuelve con operación, seguridad y una experiencia clara para operador y cliente.

## Estado

**Sandbox local listo. Producción aún no autorizada.**

La aplicación cuenta con autenticación por roles, RLS multi-cliente, API keys cifradas, tickets, uso/costos, instancias con gating de pago y ciclo sandbox de morosidad. Flow real, DTE, Railway remoto y Realtime siguen pendientes.

Consulta el [reporte GO/NO-GO](docs/eng/13-reporte-go-no-go-2026-08-30.md) para el detalle verificable.

## Qué incluye

- Portal cliente y consola de operador con Next.js 15.
- Supabase local: esquema, RLS, auditoría y migraciones.
- Registro seguro de agentes y API keys cifradas en servidor.
- Uso, estimación de costos, límites mensuales y calculadora.
- Tickets con adjuntos privados y separación de notas internas.
- Cobros e instancias en modo sandbox, con margen y protección contra impago.

## Inicio rápido

### Requisitos

- Node.js 20+
- Docker Desktop
- Supabase CLI para levantar la base local

### Aplicación

```bash
cd app
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Abre `http://localhost:3000`.

### Verificación

```bash
cd app
npm run typecheck
npm test
npm run build
```

La CI ejecuta los mismos gates en cada push y pull request.

## Estructura

```text
app/        Aplicación Next.js y pruebas
supabase/   Migraciones, rollbacks y configuración local
docs/       Producto, ingeniería y operación
brand/      Tokens de marca y diseño
```

## Seguridad

No subas archivos `.env`, claves de API, tokens de Supabase, certificados DTE ni datos de clientes. Revisa [SECURITY.md](SECURITY.md) y [CONTRIBUTING.md](CONTRIBUTING.md) antes de colaborar.

## Documentación clave

- [Modelo de producto](docs/18-definicion-producto.md)
- [Guía de despliegue e infraestructura](docs/16-despliegue-e-infra.md)
- [Auto-despliegue y costos](docs/eng/10-auto-despliegue-y-costos.md)
- [Reporte GO/NO-GO](docs/eng/13-reporte-go-no-go-2026-08-30.md)
- [Guía de flujo completo con ejemplos](docs/guia-flujo-completo.md)

## Nombre

**Kaudal** combina la idea de flujo con operación: agentes que dejan de ser piezas sueltas y pasan a moverse con control, costo visible y continuidad.

> Licencia pendiente de decisión del propietario antes de publicar el repositorio.
