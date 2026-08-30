drop policy if exists instancias_cliente on public.instancias;
drop policy if exists instancias_operador on public.instancias;
drop trigger if exists trg_instancias_updated on public.instancias;
drop table if exists public.instancias;
alter table public.suscripciones drop column if exists margen_pct;
alter table public.suscripciones drop column if exists cubre_instancia;
