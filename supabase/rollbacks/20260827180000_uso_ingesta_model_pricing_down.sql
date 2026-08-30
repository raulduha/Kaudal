-- ============================================================================
-- Rollback de 20260827180000_uso_ingesta_model_pricing.sql
-- Aplicar manualmente: supabase no revierte migraciones, solo las reaplica.
--
-- ATENCION · PERDIDA DE DATOS POSIBLE
--   1. Se pierden las idempotency_key y los `status` ya registrados. Ningun
--      evento de uso se borra (no se toca una sola fila de registros_uso), pero
--      tras revertir ya no se podra distinguir una ejecucion fallida de una
--      exitosa en el historico, ni detectar reintentos duplicados que hayan
--      llegado despues.
--   2. Se pierden las tarifas que el operador haya cargado o corregido en
--      model_pricing despues de la semilla. Las 5 filas sembradas se
--      reconstruyen reaplicando la migracion; las editadas a mano, no.
--
--   Antes de correr esto, respaldar:
--     \copy (select id, agente_id, idempotency_key, status
--              from public.registros_uso
--             where idempotency_key is not null or status <> 'ok')
--       to 'respaldo_uso_idem_status.csv' csv header
--     \copy (select * from public.model_pricing)
--       to 'respaldo_model_pricing.csv' csv header
--   Ninguno de los dos respaldos contiene material criptografico ni datos
--   personales; model_pricing es catalogo publico.
--
--   El resto (indices, politicas, grants) vuelve exacto al estado de
--   20260827160000.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. model_pricing
--    DROP TABLE se lleva sus indices, CHECK, trigger, politica RLS y GRANT.
--    Nada depende de ella: no hay FK entrante (registros_uso.modelo es texto
--    libre a proposito, para que un modelo desconocido no bloquee el ingest),
--    ni vistas que la referencien.
-- ---------------------------------------------------------------------------
drop table if exists public.model_pricing;

-- ---------------------------------------------------------------------------
-- 2. registros_uso
--    DROP COLUMN se lleva sus CHECK, comentarios e indices asociados
--    (uq_uso_idempotencia depende de idempotency_key; idx_uso_org_fallos
--    depende de status). Se dropean igual de forma explicita primero para que
--    el rollback sea legible y para no depender del orden de cascada.
-- ---------------------------------------------------------------------------
drop index if exists public.idx_uso_org_fallos;
drop index if exists public.uq_uso_idempotencia;

alter table public.registros_uso
  drop column if exists status,
  drop column if exists idempotency_key;
