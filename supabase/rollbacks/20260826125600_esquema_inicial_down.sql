-- ============================================================================
-- ROLLBACK de supabase/migrations/20260826125600_esquema_inicial.sql
-- Supabase CLI no ejecuta migraciones hacia atras: este archivo vive fuera de
-- supabase/migrations/ y se corre a mano si hay que revertir.
--
--   psql "$DATABASE_URL" -f supabase/rollbacks/20260826125600_esquema_inicial_down.sql
--
-- OJO: destruye datos. Respaldar antes (pg_dump) — regla 3 de db-guardian.
-- El esquema es nuevo y no habia datos previos, asi que el rollback no pierde
-- informacion preexistente.
-- ============================================================================

begin;

-- Reglas de inmutabilidad primero: un DROP TABLE sobre audit_log funciona igual,
-- pero se eliminan explicitamente para dejar el rastro claro.
drop rule if exists audit_log_no_update on public.audit_log;
drop rule if exists audit_log_no_delete on public.audit_log;

drop view if exists public.uso_diario;
drop view if exists public.api_keys_publicas;

-- Orden inverso al de creacion para respetar las FKs.
drop table if exists public.audit_log;
drop table if exists public.mensajes_ticket;
drop table if exists public.tickets_reclamos;
drop table if exists public.cobros;
drop table if exists public.suscripciones;
drop table if exists public.registros_uso;
drop table if exists public.agentes;
drop table if exists public.api_keys_cifradas;
drop table if exists public.usuarios;
drop table if exists public.clientes;
drop table if exists public.orgs;

drop function if exists app.set_updated_at();
drop function if exists app.current_cliente_id();
drop function if exists app.current_rol();
drop function if exists app.current_org_id();
drop function if exists app.current_usuario_id();

drop schema if exists app;

-- pgcrypto NO se elimina: es una extension compartida de Supabase.

commit;
