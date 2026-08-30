-- ============================================================================
-- ROLLBACK de supabase/migrations/20260826141500_rls_ajustes_2_2.sql
-- Supabase CLI no ejecuta migraciones hacia atras: este archivo vive fuera de
-- supabase/migrations/ y se corre a mano.
--
--   psql "$DATABASE_URL" -f supabase/rollbacks/20260826141500_rls_ajustes_2_2_down.sql
--
-- NO destruye datos: la migracion 2.2 solo cambia permisos, reglas y funciones.
-- Deja la base exactamente como la dejo 20260826125600_esquema_inicial.sql.
-- OJO: revertir reabre el agujero de TRUNCATE sobre audit_log (hallazgo H1).
-- ============================================================================

begin;

-- H3. Perfil propio
drop function if exists public.actualizar_mi_perfil(text);

-- H2/H4. tickets_reclamos
drop function if exists public.cambiar_estado_mi_ticket(uuid, text);

drop policy if exists tickets_cliente_insert on public.tickets_reclamos;
create policy tickets_cliente_insert on public.tickets_reclamos
  for insert to authenticated
  with check (org_id = app.current_org_id()
              and cliente_id = app.current_cliente_id()
              and (abierto_por is null or abierto_por = app.current_usuario_id()));

alter table public.tickets_reclamos
  alter column abierto_por drop default;

alter policy tickets_cliente_select on public.tickets_reclamos
  rename to tickets_cliente_rw;

-- H1. audit_log
drop trigger if exists trg_audit_log_no_truncate on public.audit_log;
drop function if exists app.bloquear_truncate();
grant truncate on public.audit_log to service_role;

comment on table public.audit_log is
  'Append-only. Las reglas DO INSTEAD NOTHING bloquean UPDATE/DELETE para todos (incluido service_role). La FK a usuarios es RESTRICT a proposito: no se borra un usuario con historial de auditoria.';

commit;
