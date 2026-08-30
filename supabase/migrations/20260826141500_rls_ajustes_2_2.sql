-- ============================================================================
-- Kaudal · Ajustes de RLS y append-only (Tarea 2.2)
-- Auditoria de cierre sobre 20260826125600_esquema_inicial.sql.
-- Fuente: docs/eng/02-modelo-de-datos.md §6 (matriz), docs/eng/06 §7-§8,
--         docs/eng/08 §2 (permisos de tickets).
--
-- No reescribe la migracion 2.1 (ya aplicada): solo corrige los 4 hallazgos.
--   H1 [ALTO]  audit_log podia vaciarse con TRUNCATE (las reglas DO INSTEAD
--              NOTHING solo cubren UPDATE/DELETE) y service_role tenia el
--              privilegio via GRANT ALL. Rompia el append-only.
--   H2 [MEDIO] La politica tickets_cliente_rw se llama "rw" pero es SELECT.
--              Ademas el cliente no tenia forma de cerrar/reabrir su ticket,
--              cosa que docs/eng/06 §7 y docs/eng/08 §2 si prometen.
--   H3 [BAJO]  El usuario cliente no podia editar su propio nombre. Se resuelve
--              con un RPC de columna unica, NO con una policy de UPDATE (RLS no
--              restringe columnas y una policy abriria rol/email/org_id).
--   H4 [BAJO]  tickets_reclamos.abierto_por podia quedar NULL en tickets
--              creados por el cliente: se pierde trazabilidad del autor.
--
-- Rollback: supabase/rollbacks/20260826141500_rls_ajustes_2_2_down.sql
-- Reversible y sin perdida de datos: no toca filas, solo reglas y permisos.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- H1. audit_log verdaderamente append-only (incluido service_role)
--     Defensa en profundidad, dos capas:
--       a) quitar el privilegio TRUNCATE al backend;
--       b) trigger BEFORE TRUNCATE que aborta igual (cubre al dueno de la
--          tabla y cualquier rol futuro con privilegios de mas).
--     TRUNCATE ignora RLS y no pasa por las reglas DO INSTEAD NOTHING: sin
--     esto, un service_role comprometido borraba la bitacora entera.
-- ---------------------------------------------------------------------------
revoke truncate on public.audit_log from service_role;

create or replace function app.bloquear_truncate() returns trigger
  language plpgsql as $$
  begin
    raise exception
      'La tabla %.% es append-only: TRUNCATE esta bloqueado.',
      tg_table_schema, tg_table_name
      using errcode = '0A000';
  end $$;
comment on function app.bloquear_truncate() is
  'Aborta cualquier TRUNCATE. Se usa en audit_log para sostener el append-only.';

revoke all on function app.bloquear_truncate() from public;

create trigger trg_audit_log_no_truncate
  before truncate on public.audit_log
  for each statement execute function app.bloquear_truncate();

comment on table public.audit_log is
  'Append-only. UPDATE/DELETE quedan en nada por las reglas DO INSTEAD NOTHING; TRUNCATE lo aborta trg_audit_log_no_truncate y ademas se revoco el privilegio a service_role. La FK a usuarios es RESTRICT a proposito: no se borra un usuario con historial de auditoria.';

-- ---------------------------------------------------------------------------
-- H2/H4. tickets_reclamos
--   - Se renombra tickets_cliente_rw -> tickets_cliente_select: era solo
--     lectura y el nombre enganaba en la auditoria. La matriz de docs/eng/02
--     §6.1 (cliente: SELECT + INSERT) sigue intacta: el UPDATE directo a la
--     tabla se mantiene DENEGADO para el cliente.
--   - abierto_por toma por defecto el usuario de la sesion y la politica de
--     INSERT deja de aceptar NULL: todo ticket creado desde el portal queda
--     con autor trazable. El backend (service_role) bypassa RLS y puede
--     seguir insertando con abierto_por NULL cuando actua por el cliente.
-- ---------------------------------------------------------------------------
alter policy tickets_cliente_rw on public.tickets_reclamos
  rename to tickets_cliente_select;

alter table public.tickets_reclamos
  alter column abierto_por set default app.current_usuario_id();

drop policy tickets_cliente_insert on public.tickets_reclamos;
create policy tickets_cliente_insert on public.tickets_reclamos
  for insert to authenticated
  with check (org_id      = app.current_org_id()
              and cliente_id  = app.current_cliente_id()
              and abierto_por = app.current_usuario_id());

-- RPC de transicion de estado para el cliente (docs/eng/06 §7: "Marcar como
-- resuelto"; docs/eng/08 §2: el cliente reabre). Se hace por funcion y no por
-- policy de UPDATE porque RLS no restringe columnas: con una policy el cliente
-- podria reescribir asunto, prioridad o agente_id de su ticket.
-- SECURITY DEFINER + search_path vacio; valida dueno con los helpers de sesion,
-- nunca con datos del payload.
create or replace function public.cambiar_estado_mi_ticket(
  p_ticket_id uuid,
  p_estado    text
) returns public.tickets_reclamos
language plpgsql security definer set search_path = '' as $$
declare
  v_org     uuid := app.current_org_id();
  v_cliente uuid := app.current_cliente_id();
  v_rol     text := app.current_rol();
  v_actual  text;
  v_fila    public.tickets_reclamos;
begin
  if v_rol is distinct from 'cliente' or v_org is null or v_cliente is null then
    raise exception 'No tienes permiso para cambiar el estado de este ticket.'
      using errcode = '42501';
  end if;

  if p_estado not in ('cerrado', 'abierto') then
    raise exception 'Solo puedes marcar el ticket como resuelto o volver a abrirlo.'
      using errcode = '22023';
  end if;

  select t.estado into v_actual
  from public.tickets_reclamos t
  where t.id = p_ticket_id
    and t.org_id = v_org
    and t.cliente_id = v_cliente
  for update;

  if not found then
    raise exception 'No encontramos ese ticket.' using errcode = '42501';
  end if;

  if p_estado = 'abierto' and v_actual <> 'cerrado' then
    raise exception 'Ese ticket ya esta abierto.' using errcode = '22023';
  end if;

  update public.tickets_reclamos t
     set estado     = p_estado,
         cerrado_en = case when p_estado = 'cerrado' then now() else null end
   where t.id = p_ticket_id
     and t.org_id = v_org
     and t.cliente_id = v_cliente
  returning t.* into v_fila;

  return v_fila;
end $$;

comment on function public.cambiar_estado_mi_ticket(uuid, text) is
  'El cliente cierra (resuelto) o reabre SU ticket. Unica escritura de tickets permitida al cliente; el resto de columnas queda intacto.';

revoke all on function public.cambiar_estado_mi_ticket(uuid, text) from public;
grant execute on function public.cambiar_estado_mi_ticket(uuid, text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- H3. Perfil propio (usuarios)
--   Decision de db-guardian: NO se agrega policy de UPDATE self sobre
--   public.usuarios. RLS filtra filas, no columnas: una policy
--   "using (auth_user_id = auth.uid())" dejaria al usuario reescribir rol,
--   org_id, cliente_id, email o auth_user_id, y el candado tendria que
--   sostenerse en un WITH CHECK fragil. En su lugar, un RPC que solo escribe
--   la columna `nombre`. La matriz de docs/eng/02 §6.1 (cliente: SELECT sobre
--   su fila) se mantiene tal cual para el acceso directo a la tabla.
-- ---------------------------------------------------------------------------
create or replace function public.actualizar_mi_perfil(p_nombre text)
returns public.usuarios
language plpgsql security definer set search_path = '' as $$
declare
  v_uid  uuid := auth.uid();
  v_fila public.usuarios;
begin
  if v_uid is null then
    raise exception 'Necesitas iniciar sesion.' using errcode = '42501';
  end if;

  if p_nombre is null or length(btrim(p_nombre)) = 0 then
    raise exception 'Escribe un nombre para mostrar.' using errcode = '22023';
  end if;

  if length(btrim(p_nombre)) > 120 then
    raise exception 'El nombre es demasiado largo (maximo 120 caracteres).'
      using errcode = '22023';
  end if;

  update public.usuarios u
     set nombre = btrim(p_nombre)
   where u.auth_user_id = v_uid
  returning u.* into v_fila;

  if not found then
    raise exception 'No encontramos tu perfil.' using errcode = '42501';
  end if;

  return v_fila;
end $$;

comment on function public.actualizar_mi_perfil(text) is
  'Unica escritura que un usuario puede hacer sobre su propia fila de usuarios: cambia solo `nombre`. Jamas toca rol, org_id, cliente_id, email ni auth_user_id.';

revoke all on function public.actualizar_mi_perfil(text) from public;
grant execute on function public.actualizar_mi_perfil(text)
  to authenticated, service_role;
