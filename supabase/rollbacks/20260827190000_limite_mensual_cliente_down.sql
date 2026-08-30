-- ============================================================================
-- Rollback de 20260827190000_limite_mensual_cliente.sql
-- Aplicar manualmente: supabase no revierte migraciones, solo las reaplica.
--
-- ATENCION · PERDIDA DE DATOS POSIBLE
--   Se pierden los limites mensuales que los clientes hayan declarado. No es
--   dato critico (es auto-declarado e informativo, no un tope que Kaudal haga
--   cumplir), pero cada cliente tendria que volver a escribir su numero.
--   Ninguna otra columna ni fila de public.clientes se toca.
--
--   Antes de correr esto, respaldar:
--     \copy (select id, org_id, limite_mensual_clp
--              from public.clientes
--             where limite_mensual_clp is not null)
--       to 'respaldo_limite_mensual.csv' csv header
--   El respaldo no contiene secretos ni datos personales: solo id, org y monto.
--
--   El resto (policies, grants de tabla, indices) vuelve exacto al estado de
--   20260827180000: esta migracion no los habia modificado.
-- ============================================================================

-- 1. El RPC primero: depende del tipo de retorno public.clientes, pero no de la
--    columna, asi que el orden da igual. Se dropea explicito igual para que el
--    rollback sea legible y no queden funciones huerfanas si el DROP COLUMN
--    fallara.
drop function if exists public.actualizar_limite_mensual_cliente(numeric);

-- 2. La columna. DROP COLUMN se lleva su CHECK (chk_clientes_limite_mensual) y
--    su comentario. Se dropea el CHECK explicito primero por legibilidad.
alter table public.clientes
  drop constraint if exists chk_clientes_limite_mensual;

alter table public.clientes
  drop column if exists limite_mensual_clp;
