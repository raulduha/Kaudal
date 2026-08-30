revoke select on public.instancias_publicas, public.instancias_operador from authenticated;
drop view if exists public.instancias_operador;
drop view if exists public.instancias_publicas;
grant select on public.instancias to authenticated;
