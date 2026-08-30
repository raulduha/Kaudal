# Kaudal · Aplicación

La aplicación web de Kaudal, construida con Next.js 15 y Supabase.

## Desarrollo

```bash
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Variables requeridas están descritas en `.env.example`; no copies valores reales al repositorio.

## Calidad

```bash
npm run typecheck
npm test
npm run build
```

La aplicación requiere Supabase local para la suite de integración/RLS. Las migraciones viven en `../supabase/migrations/`.

Para contexto de producto, seguridad y estado de producción, vuelve al [README principal](../README.md).
