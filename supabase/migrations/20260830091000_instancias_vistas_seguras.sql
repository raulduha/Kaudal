-- Seguimiento: la tabla base no entrega IDs internos del proveedor al cliente.
revoke select on public.instancias from authenticated;
create or replace view public.instancias_publicas with (security_barrier = true) as
  select id, cliente_id, estado, created_at, updated_at
  from public.instancias
  where org_id = app.current_org_id() and cliente_id = app.current_cliente_id();
create or replace view public.instancias_operador with (security_barrier = true) as
  select * from public.instancias
  where org_id = app.current_org_id() and app.current_rol() = 'operador';
grant select on public.instancias_publicas, public.instancias_operador to authenticated;
