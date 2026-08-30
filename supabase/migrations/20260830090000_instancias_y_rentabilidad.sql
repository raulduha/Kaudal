-- Kaudal · Fase 11.5: instancia por cliente, sin exponer IDs del proveedor.
alter table public.suscripciones
  add column cubre_instancia boolean not null default false,
  add column margen_pct integer not null default 0 check (margen_pct >= 0 and margen_pct <= 1000);

create table public.instancias (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete restrict,
  cliente_id uuid not null,
  suscripcion_id uuid references public.suscripciones(id) on delete restrict,
  proveedor text not null default 'railway' check (proveedor in ('railway','manual','vps')),
  proveedor_project_id text,
  proveedor_service_id text,
  url text check (url is null or url ~* '^https://'),
  estado text not null default 'pendiente' check (estado in ('pendiente','activa','suspendida','eliminada')),
  costo_mensual_estimado_clp numeric(14,2) not null default 0 check (costo_mensual_estimado_clp >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fk_instancias_cliente foreign key (cliente_id, org_id) references public.clientes(id, org_id) on delete restrict,
  constraint uq_instancia_cliente unique (cliente_id)
);
create index idx_instancias_org_estado on public.instancias(org_id, estado);
create trigger trg_instancias_updated before update on public.instancias for each row execute function app.set_updated_at();
alter table public.instancias enable row level security;
alter table public.instancias force row level security;
create policy instancias_operador on public.instancias for all to authenticated
  using (org_id = app.current_org_id() and app.current_rol() = 'operador')
  with check (org_id = app.current_org_id() and app.current_rol() = 'operador');
create policy instancias_cliente on public.instancias for select to authenticated
  using (org_id = app.current_org_id() and cliente_id = app.current_cliente_id());
revoke all on public.instancias from anon, authenticated;
grant insert, update on public.instancias to authenticated;
create view public.instancias_publicas with (security_barrier = true) as
  select id, cliente_id, estado, created_at, updated_at
  from public.instancias
  where org_id = app.current_org_id() and cliente_id = app.current_cliente_id();
create view public.instancias_operador with (security_barrier = true) as
  select * from public.instancias
  where org_id = app.current_org_id() and app.current_rol() = 'operador';
grant select on public.instancias_publicas, public.instancias_operador to authenticated;
