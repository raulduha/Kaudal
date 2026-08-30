-- ============================================================================
-- ROLLBACK de supabase/migrations/20260826163000_hardening_grants_2_2.sql
-- Supabase CLI no ejecuta migraciones hacia atras: se corre a mano.
--
--   psql "$DATABASE_URL" -f supabase/rollbacks/20260826163000_hardening_grants_2_2_down.sql
--
-- NO destruye datos. OJO: revertir vuelve a exponer los RPC SECURITY DEFINER
-- al rol `anon` y reactiva los default privileges que regalan permisos sobre
-- cada objeto nuevo de `public`.
-- ============================================================================

begin;

alter function app.bloquear_truncate() reset search_path;
alter function app.set_updated_at()    reset search_path;

alter default privileges in schema public grant all       on tables    to anon, authenticated;
alter default privileges in schema public grant execute   on functions to anon, authenticated;
alter default privileges in schema public grant all       on sequences to anon, authenticated;

grant execute on function public.actualizar_mi_perfil(text)           to anon;
grant execute on function public.cambiar_estado_mi_ticket(uuid, text) to anon;

comment on schema public is null;

commit;
