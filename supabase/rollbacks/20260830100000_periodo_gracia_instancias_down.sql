drop index if exists public.suscripciones_morosas_gracia_idx;
alter table public.suscripciones drop constraint if exists suscripciones_periodo_gracia_morosa_check;
alter table public.suscripciones drop column if exists periodo_gracia_hasta;
