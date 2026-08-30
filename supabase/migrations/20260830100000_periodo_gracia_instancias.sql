-- El impago no corta de inmediato: deja una ventana explícita de cinco días.
alter table public.suscripciones
  add column if not exists periodo_gracia_hasta timestamptz;

alter table public.suscripciones
  add constraint suscripciones_periodo_gracia_morosa_check
  check (periodo_gracia_hasta is null or estado = 'morosa');

create index if not exists suscripciones_morosas_gracia_idx
  on public.suscripciones (periodo_gracia_hasta)
  where estado = 'morosa' and periodo_gracia_hasta is not null;
