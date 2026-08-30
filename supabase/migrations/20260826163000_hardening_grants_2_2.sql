-- ============================================================================
-- Kaudal · Hardening de privilegios (cierre de auditoria de la Tarea 2.2)
-- Auditor: security-auditor. Hallazgo ALTO-2 de la revision de
--   20260826125600_esquema_inicial.sql + 20260826141500_rls_ajustes_2_2.sql
--
-- PROBLEMA
--   Supabase trae ALTER DEFAULT PRIVILEGES IN SCHEMA public que conceden, a
--   `anon` y `authenticated`, TODO sobre cada tabla nueva y EXECUTE sobre cada
--   funcion nueva creada por `postgres` (rol con el que corren las migraciones).
--   `REVOKE ALL ... FROM PUBLIC` NO deshace un grant nominal a `anon`.
--   Consecuencia verificada en la base:
--     public.actualizar_mi_perfil(text)             -> anon=X/postgres
--     public.cambiar_estado_mi_ticket(uuid,text)    -> anon=X/postgres
--   Ambas son SECURITY DEFINER y su dueno (`postgres`) tiene BYPASSRLS, y
--   quedan publicadas por PostgREST en /rest/v1/rpc/... con la sola anon key
--   (que viaja en el bundle del navegador). Hoy fallan cerradas por sus propias
--   guardas, pero contradicen el minimo privilegio declarado en 2.2 y dejan
--   una trampa para toda tabla/funcion futura de `public`.
--
-- SOLUCION (dos capas)
--   a) Quitar el EXECUTE nominal de `anon` sobre los dos RPC ya creados.
--   b) Apagar los default privileges de `postgres` en `public` para `anon` y
--      `authenticated`: de aqui en adelante NINGUN objeto nuevo nace con
--      permisos regalados. Cada migracion debe declarar sus GRANT explicitos
--      (es el patron que ya usa la seccion 9 de 20260826125600).
--      Falla cerrada: si alguien olvida el GRANT, la feature se rompe fuerte
--      en vez de exponer datos en silencio.
--
--   c) Bonus (hallazgo BAJO): fijar search_path vacio en las dos funciones de
--      trigger que no lo tenian. Son SECURITY INVOKER, asi que el riesgo real
--      es nulo, pero deja el esquema limpio ante el linter de Supabase
--      (function_search_path_mutable) y ante un cambio futuro a DEFINER.
--
-- Rollback: supabase/rollbacks/20260826163000_hardening_grants_2_2_down.sql
-- No toca filas ni politicas RLS: solo privilegios y atributos de funcion.
-- ============================================================================

-- (a) los dos RPC de 2.2 dejan de ser invocables sin sesion
revoke all on function public.actualizar_mi_perfil(text)              from anon;
revoke all on function public.cambiar_estado_mi_ticket(uuid, text)    from anon;

-- (b) nada nuevo en `public` nace con permisos para el frontend
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

-- (c) search_path fijo en las funciones de trigger
alter function app.set_updated_at()    set search_path = '';
alter function app.bloquear_truncate() set search_path = '';

comment on schema public is
  'Sin default privileges para anon/authenticated: toda tabla, vista o funcion nueva debe declarar sus GRANT explicitos en la migracion que la crea.';
