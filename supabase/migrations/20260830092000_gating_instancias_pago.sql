-- Ninguna instancia puede quedar activa si su suscripción no cubre el servicio.
create or replace function app.exigir_suscripcion_para_instancia() returns trigger
language plpgsql security definer set search_path = '' as $fn$
begin
  if new.estado = 'activa' and not exists (
    select 1 from public.suscripciones s
    where s.id = new.suscripcion_id
      and s.org_id = new.org_id
      and s.cliente_id = new.cliente_id
      and s.estado = 'activa'
      and s.cubre_instancia = true
      and s.deleted_at is null
  ) then
    raise exception 'No puedes activar una instancia sin una suscripción activa que cubra la instancia.' using errcode = '23514';
  end if;
  return new;
end $fn$;
revoke all on function app.exigir_suscripcion_para_instancia() from public, anon, authenticated;
create trigger trg_instancias_exigir_pago before insert or update of estado, suscripcion_id on public.instancias
  for each row execute function app.exigir_suscripcion_para_instancia();
