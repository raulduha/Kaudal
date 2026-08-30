-- Evita la carrera entre un pago entrante y el cron de morosidad.
create or replace function app.suspender_instancias_morosas_vencidas()
returns integer
language plpgsql security definer set search_path = '' as $fn$
declare cantidad integer;
begin
  with vencidas as (
    update public.suscripciones
       set periodo_gracia_hasta = null
     where estado = 'morosa'
       and periodo_gracia_hasta is not null
       and periodo_gracia_hasta <= now()
     returning id
  ), suspendidas as (
    update public.instancias i
       set estado = 'suspendida'
      from vencidas v
     where i.suscripcion_id = v.id
       and i.estado = 'activa'
     returning i.id
  )
  select count(*)::integer into cantidad from suspendidas;
  return cantidad;
end $fn$;

revoke all on function app.suspender_instancias_morosas_vencidas() from public, anon, authenticated;
grant execute on function app.suspender_instancias_morosas_vencidas() to service_role;
