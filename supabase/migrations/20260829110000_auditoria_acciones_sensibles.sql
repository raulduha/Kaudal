-- Kaudal · Tarea 6.3: auditoría transversal de acciones sensibles.
--
-- El log va en triggers y no en cada Route Handler: así también quedan
-- cubiertos los cambios hechos por RPC, PostgREST o service_role. Nunca se
-- serializan secretos, URLs privadas ni material criptográfico.

create or replace function app.auditar_accion_sensible() returns trigger
language plpgsql security definer set search_path = '' as $fn$
declare
  v_nuevo jsonb;
  v_anterior jsonb;
  v_actor uuid := app.current_usuario_id();
  v_rol text := coalesce(app.current_rol(), 'sistema');
  v_accion text;
  v_datos jsonb := '{}'::jsonb;
begin
  -- Estas entidades usan borrado lógico; no se registra DELETE físico para
  -- que una compensación técnica no parezca una acción de negocio.
  if tg_op = 'DELETE' then
    return null;
  end if;

  v_nuevo := pg_catalog.to_jsonb(new);
  if tg_op = 'UPDATE' then
    v_anterior := pg_catalog.to_jsonb(old);
  end if;

  if tg_table_name = 'clientes' then
    if tg_op = 'INSERT' then
      v_accion := 'cliente.alta';
      v_datos := pg_catalog.jsonb_build_object('cliente_id', new.id);
    elsif (v_nuevo ->> 'deleted_at') is distinct from (v_anterior ->> 'deleted_at') then
      v_accion := case when new.deleted_at is null then 'cliente.reactivado' else 'cliente.archivado' end;
    end if;

  elsif tg_table_name = 'usuarios' then
    if tg_op = 'INSERT' then
      v_accion := 'usuario.alta';
      v_datos := pg_catalog.jsonb_build_object('rol_asignado', new.rol, 'cliente_id', new.cliente_id);
    elsif new.rol is distinct from old.rol then
      v_accion := 'usuario.cambio_rol';
      v_datos := pg_catalog.jsonb_build_object('antes', old.rol, 'despues', new.rol);
    end if;

  elsif tg_table_name = 'agentes' then
    if tg_op = 'INSERT' then
      v_accion := 'agente.alta';
      v_datos := pg_catalog.jsonb_build_object(
        'cliente_id', new.cliente_id,
        'tipo', new.tipo,
        'metodo_reporte', new.metodo_reporte
      );
    elsif new.deleted_at is distinct from old.deleted_at then
      v_accion := case when new.deleted_at is null then 'agente.reactivado' else 'agente.archivado' end;
    elsif new.estado is distinct from old.estado then
      v_accion := 'agente.cambio_estado';
      v_datos := pg_catalog.jsonb_build_object('antes', old.estado, 'despues', new.estado);
    end if;

  elsif tg_table_name = 'suscripciones' then
    if tg_op = 'INSERT' then
      v_accion := 'suscripcion.alta';
      v_datos := pg_catalog.jsonb_build_object('cliente_id', new.cliente_id, 'plan', new.plan);
    elsif new.deleted_at is distinct from old.deleted_at then
      v_accion := case when new.deleted_at is null then 'suscripcion.reactivada' else 'suscripcion.archivada' end;
    elsif new.estado is distinct from old.estado then
      v_accion := 'suscripcion.cambio_estado';
      v_datos := pg_catalog.jsonb_build_object('antes', old.estado, 'despues', new.estado);
    end if;

  elsif tg_table_name = 'cobros' then
    if tg_op = 'INSERT' then
      v_accion := 'cobro.alta';
      v_datos := pg_catalog.jsonb_build_object('cliente_id', new.cliente_id, 'monto', new.monto, 'moneda', new.moneda);
    elsif new.estado is distinct from old.estado then
      v_accion := 'cobro.cambio_estado';
      v_datos := pg_catalog.jsonb_build_object('antes', old.estado, 'despues', new.estado);
    elsif new.dte_estado is distinct from old.dte_estado then
      v_accion := 'cobro.cambio_dte';
      v_datos := pg_catalog.jsonb_build_object('antes', old.dte_estado, 'despues', new.dte_estado);
    end if;
  end if;

  if v_accion is not null then
    insert into public.audit_log (org_id, actor_id, actor_rol, accion, entidad, entidad_id, datos)
    values (new.org_id, v_actor, v_rol, v_accion, tg_table_name, new.id, v_datos);
  end if;

  return null;
end
$fn$;

comment on function app.auditar_accion_sensible() is
  'Audita altas y cambios de ciclo de vida de clientes, usuarios, agentes, suscripciones y cobros. Corre con el actor de la sesión cuando existe; service_role queda como sistema. No registra secretos ni endpoints.';

revoke all on function app.auditar_accion_sensible() from public, anon, authenticated;

create trigger trg_clientes_auditar_acciones_sensibles
  after insert or update on public.clientes
  for each row execute function app.auditar_accion_sensible();

create trigger trg_usuarios_auditar_acciones_sensibles
  after insert or update on public.usuarios
  for each row execute function app.auditar_accion_sensible();

create trigger trg_agentes_auditar_acciones_sensibles
  after insert or update on public.agentes
  for each row execute function app.auditar_accion_sensible();

create trigger trg_suscripciones_auditar_acciones_sensibles
  after insert or update on public.suscripciones
  for each row execute function app.auditar_accion_sensible();

create trigger trg_cobros_auditar_acciones_sensibles
  after insert or update on public.cobros
  for each row execute function app.auditar_accion_sensible();
