-- ============================================================================
-- Kaudal · Migración inicial del esquema (Tarea 2.1)
-- Fuente: docs/eng/02-modelo-de-datos.md
-- Revisada por db-guardian: aislamiento multi-tenant por org_id + cliente_id.
--
-- Orden: extensiones -> schema app -> helpers -> tablas -> triggers ->
--        reglas -> RLS -> políticas -> vistas -> grants.
-- Rollback: supabase/rollbacks/20260826125600_esquema_inicial_down.sql
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Extensiones y schema de utilidades
-- ---------------------------------------------------------------------------
create extension if not exists pgcrypto with schema extensions;

create schema if not exists app;
comment on schema app is
  'Utilidades internas de Kaudal (helpers de sesión y triggers). No se expone por PostgREST.';

-- ---------------------------------------------------------------------------
-- 1. Helpers de contexto de sesión (docs/eng/02 §2)
--    Se crean en la sección 3.12, DESPUÉS de public.usuarios: son funciones
--    `language sql` y Postgres valida su cuerpo al crearlas, así que no pueden
--    declararse antes de la tabla que consultan (el orden de §2 del doc no es
--    aplicable tal cual).
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 2. Trigger común de updated_at (docs/eng/02 §7)
-- ---------------------------------------------------------------------------
create or replace function app.set_updated_at() returns trigger
  language plpgsql as $$
  begin
    new.updated_at := now();
    return new;
  end $$;

-- ---------------------------------------------------------------------------
-- 3. Tablas
-- ---------------------------------------------------------------------------

-- 3.1 ORGS -------------------------------------------------------------------
-- Excepción documentada a la regla "toda tabla lleva org_id": en orgs, `id`
-- ES el org_id (es la raíz del tenant).
create table public.orgs (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null check (length(btrim(nombre)) > 0),
  rut            text,
  email_contacto text check (email_contacto is null or email_contacto ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  dte_config     jsonb not null default '{}'::jsonb,
  flow_config    jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index uq_orgs_rut on public.orgs(rut) where rut is not null;
comment on column public.orgs.dte_config is 'Config LibreDTE (folios, giro, emisor). NUNCA secretos en claro: van cifrados fuera de la BD.';
comment on column public.orgs.flow_config is 'Referencias de cuenta Flow (no secretos).';

-- 3.2 CLIENTES ---------------------------------------------------------------
create table public.clientes (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs(id) on delete restrict,
  razon_social    text not null check (length(btrim(razon_social)) > 0),
  nombre_fantasia text,
  rut             text,
  giro            text,
  direccion       text,
  email           text check (email is null or email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  estado          text not null default 'activo'
                  check (estado in ('activo','suspendido','inactivo')),
  plan_default    text,
  deleted_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- objetivo de FK compuestas: ningún hijo puede mezclar el org_id de otra org
  constraint uq_clientes_id_org unique (id, org_id)
);
create index idx_clientes_org on public.clientes(org_id);
create index idx_clientes_org_estado on public.clientes(org_id, estado) where deleted_at is null;
create unique index uq_clientes_rut on public.clientes(org_id, rut) where deleted_at is null;

-- 3.3 USUARIOS ---------------------------------------------------------------
create table public.usuarios (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs(id) on delete restrict,
  cliente_id    uuid,
  auth_user_id  uuid not null references auth.users(id) on delete cascade,
  rol           text not null default 'cliente'
                check (rol in ('operador','cliente')),
  nombre        text,
  email         text not null check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  ultimo_acceso timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint chk_rol_cliente check (
    (rol = 'operador' and cliente_id is null) or
    (rol = 'cliente'  and cliente_id is not null)
  ),
  constraint fk_usuarios_cliente foreign key (cliente_id, org_id)
    references public.clientes(id, org_id) on delete restrict,
  constraint uq_usuarios_id_org unique (id, org_id)
);
create unique index uq_usuarios_auth on public.usuarios(auth_user_id);
create unique index uq_usuarios_org_email on public.usuarios(org_id, lower(email));
create index idx_usuarios_org_rol on public.usuarios(org_id, rol);
create index idx_usuarios_cliente on public.usuarios(cliente_id) where cliente_id is not null;

-- 3.4 API_KEYS_CIFRADAS ------------------------------------------------------
create table public.api_keys_cifradas (
  id              uuid primary key default gen_random_uuid(),
  cliente_id      uuid not null,
  org_id          uuid not null references public.orgs(id) on delete restrict,
  proveedor       text not null check (proveedor in ('anthropic','openai','otro')),
  alias           text,
  key_ciphertext  bytea not null check (length(key_ciphertext) > 0),
  key_iv          bytea not null check (length(key_iv) > 0),
  key_auth_tag    bytea not null check (length(key_auth_tag) > 0),
  key_last4       text check (key_last4 is null or length(key_last4) <= 4),
  key_fingerprint text,
  estado          text not null default 'activa'
                  check (estado in ('activa','revocada')),
  rotada_de       uuid references public.api_keys_cifradas(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint fk_apikeys_cliente foreign key (cliente_id, org_id)
    references public.clientes(id, org_id) on delete restrict,
  constraint uq_apikeys_id_cliente unique (id, cliente_id)
);
create index idx_apikeys_cliente on public.api_keys_cifradas(cliente_id, estado);
create index idx_apikeys_org on public.api_keys_cifradas(org_id);
create unique index uq_apikeys_alias_activa
  on public.api_keys_cifradas(cliente_id, proveedor, alias) where estado = 'activa';
create index idx_apikeys_fingerprint
  on public.api_keys_cifradas(cliente_id, key_fingerprint) where key_fingerprint is not null;
create index idx_apikeys_rotada_de
  on public.api_keys_cifradas(rotada_de) where rotada_de is not null;
comment on table public.api_keys_cifradas is
  'SEGURIDAD CRITICA: ciphertext AES-256-GCM. authenticated NO tiene privilegios sobre esta tabla; solo lee metadatos por la vista api_keys_publicas. Descifra unicamente el backend (service_role) con clave maestra fuera de la BD.';
comment on column public.api_keys_cifradas.key_ciphertext is 'Jamás se expone al frontend.';
comment on column public.api_keys_cifradas.key_iv is 'Jamás se expone al frontend.';
comment on column public.api_keys_cifradas.key_auth_tag is 'Jamás se expone al frontend.';

-- 3.5 AGENTES ----------------------------------------------------------------
create table public.agentes (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.orgs(id) on delete restrict,
  cliente_id        uuid not null,
  nombre            text not null check (length(btrim(nombre)) > 0),
  descripcion       text,
  tipo              text not null default 'mastra'
                    check (tipo in ('mastra','n8n','custom')),
  endpoint_url      text check (endpoint_url is null or endpoint_url ~* '^https://'),
  metodo_reporte    text not null default 'estimado'
                    check (metodo_reporte in ('estimado','reportado')),
  modelo_default    text,
  api_key_id        uuid,
  ingest_token_hash text,
  estado            text not null default 'activo'
                    check (estado in ('activo','pausado','archivado')),
  deleted_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint fk_agentes_cliente foreign key (cliente_id, org_id)
    references public.clientes(id, org_id) on delete restrict,
  -- la llave que usa el agente debe pertenecer al MISMO cliente
  constraint fk_agentes_apikey foreign key (api_key_id, cliente_id)
    references public.api_keys_cifradas(id, cliente_id) on delete restrict,
  constraint uq_agentes_id_cliente unique (id, cliente_id),
  constraint chk_agentes_ingest check (
    metodo_reporte <> 'reportado' or ingest_token_hash is not null
  )
);
create index idx_agentes_cliente on public.agentes(cliente_id, estado) where deleted_at is null;
create index idx_agentes_org on public.agentes(org_id);
create index idx_agentes_api_key on public.agentes(api_key_id) where api_key_id is not null;
create unique index uq_agentes_ingest_token
  on public.agentes(ingest_token_hash) where ingest_token_hash is not null;
comment on column public.agentes.ingest_token_hash is
  'Hash del token de ingesta (nunca el token en claro). endpoint_url exige https.';

-- 3.6 REGISTROS_USO ----------------------------------------------------------
create table public.registros_uso (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.orgs(id) on delete restrict,
  cliente_id     uuid not null,
  agente_id      uuid not null,
  ocurrido_en    timestamptz not null default now(),
  modelo         text,
  tokens_in      bigint default 0 check (tokens_in is null or tokens_in >= 0),
  tokens_out     bigint default 0 check (tokens_out is null or tokens_out >= 0),
  unidades       integer not null default 1 check (unidades > 0),
  costo_estimado numeric(14,4) not null default 0 check (costo_estimado >= 0),
  moneda         char(3) not null default 'CLP' check (moneda ~ '^[A-Z]{3}$'),
  origen         text not null default 'estimado'
                 check (origen in ('estimado','reportado')),
  metadata       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint fk_uso_cliente foreign key (cliente_id, org_id)
    references public.clientes(id, org_id) on delete restrict,
  -- el agente debe ser del mismo cliente que consume
  constraint fk_uso_agente foreign key (agente_id, cliente_id)
    references public.agentes(id, cliente_id) on delete restrict
);
create index idx_uso_cliente_fecha on public.registros_uso(cliente_id, ocurrido_en desc);
create index idx_uso_agente_fecha  on public.registros_uso(agente_id, ocurrido_en desc);
create index idx_uso_org_fecha     on public.registros_uso(org_id, ocurrido_en desc);
comment on table public.registros_uso is
  'Base del costo estimado. Considerar particionado por rango de ocurrido_en cuando crezca el volumen.';

-- 3.7 SUSCRIPCIONES ----------------------------------------------------------
create table public.suscripciones (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.orgs(id) on delete restrict,
  cliente_id           uuid not null,
  plan                 text not null check (length(btrim(plan)) > 0),
  monto                numeric(14,2) not null check (monto >= 0),
  moneda               char(3) not null default 'CLP' check (moneda ~ '^[A-Z]{3}$'),
  periodicidad         text not null default 'mensual'
                       check (periodicidad in ('mensual','anual')),
  estado               text not null default 'activa'
                       check (estado in ('activa','pausada','cancelada','morosa')),
  flow_subscription_id text,
  flow_customer_id     text,
  inicio               date,
  proximo_cobro        date,
  deleted_at           timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint fk_susc_cliente foreign key (cliente_id, org_id)
    references public.clientes(id, org_id) on delete restrict,
  constraint uq_susc_id_cliente unique (id, cliente_id),
  constraint chk_susc_fechas check (
    proximo_cobro is null or inicio is null or proximo_cobro >= inicio
  )
);
create index idx_susc_cliente on public.suscripciones(cliente_id, estado) where deleted_at is null;
create index idx_susc_org on public.suscripciones(org_id, estado);
create unique index uq_susc_flow on public.suscripciones(flow_subscription_id)
  where flow_subscription_id is not null;
create index idx_susc_proximo_cobro on public.suscripciones(proximo_cobro)
  where estado = 'activa' and deleted_at is null;

-- 3.8 COBROS -----------------------------------------------------------------
create table public.cobros (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs(id) on delete restrict,
  cliente_id      uuid not null,
  suscripcion_id  uuid,
  monto           numeric(14,2) not null check (monto >= 0),
  moneda          char(3) not null default 'CLP' check (moneda ~ '^[A-Z]{3}$'),
  estado          text not null default 'pendiente'
                  check (estado in ('pendiente','pagado','rechazado','reembolsado')),
  flow_payment_id text,
  flow_order      text,
  pagado_en       timestamptz,
  dte_tipo        text check (dte_tipo in ('boleta','factura')),
  dte_folio       text,
  dte_estado      text not null default 'no_emitido'
                  check (dte_estado in ('no_emitido','emitido','anulado')),
  dte_url         text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint fk_cobros_cliente foreign key (cliente_id, org_id)
    references public.clientes(id, org_id) on delete restrict,
  -- la suscripción cobrada debe ser del mismo cliente
  constraint fk_cobros_suscripcion foreign key (suscripcion_id, cliente_id)
    references public.suscripciones(id, cliente_id) on delete restrict,
  constraint chk_cobros_pagado check (estado <> 'pagado' or pagado_en is not null),
  constraint chk_cobros_dte check (
    dte_estado = 'no_emitido' or (dte_folio is not null and dte_tipo is not null)
  )
);
create index idx_cobros_cliente on public.cobros(cliente_id, estado);
create index idx_cobros_org on public.cobros(org_id, estado);
create index idx_cobros_suscripcion on public.cobros(suscripcion_id) where suscripcion_id is not null;
create unique index uq_cobros_flow on public.cobros(flow_payment_id)
  where flow_payment_id is not null;
create unique index uq_cobros_dte_folio on public.cobros(org_id, dte_tipo, dte_folio)
  where dte_folio is not null;

-- 3.9 TICKETS_RECLAMOS -------------------------------------------------------
create table public.tickets_reclamos (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.orgs(id) on delete restrict,
  cliente_id        uuid not null,
  agente_id         uuid,
  abierto_por       uuid,
  tipo              text not null default 'duda' check (tipo in ('duda','reclamo')),
  asunto            text not null check (length(btrim(asunto)) > 0),
  estado            text not null default 'abierto'
                    check (estado in ('abierto','en_proceso','respondido','cerrado')),
  prioridad         text not null default 'normal'
                    check (prioridad in ('baja','normal','alta')),
  ultimo_mensaje_en timestamptz,
  cerrado_en        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint fk_tickets_cliente foreign key (cliente_id, org_id)
    references public.clientes(id, org_id) on delete restrict,
  constraint fk_tickets_agente foreign key (agente_id, cliente_id)
    references public.agentes(id, cliente_id) on delete restrict,
  constraint fk_tickets_abierto_por foreign key (abierto_por, org_id)
    references public.usuarios(id, org_id) on delete restrict,
  constraint uq_tickets_id_org unique (id, org_id),
  constraint chk_tickets_cerrado check (estado <> 'cerrado' or cerrado_en is not null)
);
create index idx_tickets_cliente on public.tickets_reclamos(cliente_id, estado);
create index idx_tickets_org on public.tickets_reclamos(org_id, estado, ultimo_mensaje_en desc);
create index idx_tickets_agente on public.tickets_reclamos(agente_id) where agente_id is not null;
create index idx_tickets_abierto_por on public.tickets_reclamos(abierto_por) where abierto_por is not null;

-- 3.10 MENSAJES_TICKET -------------------------------------------------------
create table public.mensajes_ticket (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.orgs(id) on delete restrict,
  ticket_id          uuid not null,
  autor_id           uuid,
  autor_rol          text not null check (autor_rol in ('operador','cliente')),
  cuerpo             text not null check (length(btrim(cuerpo)) > 0),
  adjuntos           jsonb not null default '[]'::jsonb,
  leido_por_operador boolean not null default false,
  leido_por_cliente  boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint fk_mensajes_ticket foreign key (ticket_id, org_id)
    references public.tickets_reclamos(id, org_id) on delete cascade,
  constraint fk_mensajes_autor foreign key (autor_id, org_id)
    references public.usuarios(id, org_id) on delete restrict
);
create index idx_mensajes_ticket on public.mensajes_ticket(ticket_id, created_at);
create index idx_mensajes_org on public.mensajes_ticket(org_id);
create index idx_mensajes_autor on public.mensajes_ticket(autor_id) where autor_id is not null;
create index idx_mensajes_no_leidos_operador
  on public.mensajes_ticket(org_id, created_at desc) where leido_por_operador = false;

-- 3.11 AUDIT_LOG (append-only) -----------------------------------------------
create table public.audit_log (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs(id) on delete restrict,
  actor_id   uuid,
  actor_rol  text check (actor_rol in ('operador','cliente','sistema')),
  accion     text not null check (length(btrim(accion)) > 0),
  entidad    text,
  entidad_id uuid,
  datos      jsonb not null default '{}'::jsonb,
  ip         inet,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fk_audit_actor foreign key (actor_id, org_id)
    references public.usuarios(id, org_id) on delete restrict
);
create index idx_audit_org_fecha on public.audit_log(org_id, created_at desc);
create index idx_audit_entidad on public.audit_log(entidad, entidad_id);
create index idx_audit_accion_fecha on public.audit_log(accion, created_at desc);
create index idx_audit_actor on public.audit_log(actor_id) where actor_id is not null;
comment on table public.audit_log is
  'Append-only. Las reglas DO INSTEAD NOTHING bloquean UPDATE/DELETE para todos (incluido service_role). La FK a usuarios es RESTRICT a proposito: no se borra un usuario con historial de auditoria.';

-- 3.12 HELPERS DE SESIÓN (docs/eng/02 §2) ------------------------------------
--    SECURITY DEFINER: deben poder leer public.usuarios sin quedar atrapados
--    en las propias políticas RLS de esa tabla (evita recursión y lockout).
--    search_path vacío: obliga a calificar todo y evita secuestro de search_path.
--    Sin sesión válida devuelven NULL -> toda comparación con org_id da NULL ->
--    ninguna política calza -> deniega por defecto.
create or replace function app.current_usuario_id() returns uuid
  language sql stable security definer set search_path = '' as $$
    select u.id from public.usuarios u where u.auth_user_id = auth.uid()
$$;
comment on function app.current_usuario_id() is
  'ID de public.usuarios del usuario autenticado. Anadido por db-guardian (no esta en §2) para evitar suplantacion de autor_id/abierto_por.';

create or replace function app.current_org_id() returns uuid
  language sql stable security definer set search_path = '' as $$
    select u.org_id from public.usuarios u where u.auth_user_id = auth.uid()
$$;

create or replace function app.current_rol() returns text
  language sql stable security definer set search_path = '' as $$
    select u.rol from public.usuarios u where u.auth_user_id = auth.uid()
$$;

create or replace function app.current_cliente_id() returns uuid
  language sql stable security definer set search_path = '' as $$
    select u.cliente_id from public.usuarios u where u.auth_user_id = auth.uid()
$$;

-- ---------------------------------------------------------------------------
-- 4. Triggers de updated_at (docs/eng/02 §7) — uno por tabla mutable.
--    audit_log queda fuera: es inmutable, el UPDATE nunca ocurre.
-- ---------------------------------------------------------------------------
create trigger trg_orgs_updated            before update on public.orgs              for each row execute function app.set_updated_at();
create trigger trg_clientes_updated        before update on public.clientes          for each row execute function app.set_updated_at();
create trigger trg_usuarios_updated        before update on public.usuarios          for each row execute function app.set_updated_at();
create trigger trg_apikeys_updated         before update on public.api_keys_cifradas for each row execute function app.set_updated_at();
create trigger trg_agentes_updated         before update on public.agentes           for each row execute function app.set_updated_at();
create trigger trg_registros_uso_updated   before update on public.registros_uso     for each row execute function app.set_updated_at();
create trigger trg_suscripciones_updated   before update on public.suscripciones     for each row execute function app.set_updated_at();
create trigger trg_cobros_updated          before update on public.cobros            for each row execute function app.set_updated_at();
create trigger trg_tickets_updated         before update on public.tickets_reclamos  for each row execute function app.set_updated_at();
create trigger trg_mensajes_ticket_updated before update on public.mensajes_ticket   for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- 5. Inmutabilidad de audit_log (docs/eng/02 §7)
-- ---------------------------------------------------------------------------
create rule audit_log_no_update as
  on update to public.audit_log do instead nothing;
create rule audit_log_no_delete as
  on delete to public.audit_log do instead nothing;

-- ---------------------------------------------------------------------------
-- 6. RLS: activar en las 11 tablas
-- ---------------------------------------------------------------------------
alter table public.orgs               enable row level security;
alter table public.clientes           enable row level security;
alter table public.usuarios           enable row level security;
alter table public.api_keys_cifradas  enable row level security;
alter table public.agentes            enable row level security;
alter table public.registros_uso      enable row level security;
alter table public.suscripciones      enable row level security;
alter table public.cobros             enable row level security;
alter table public.tickets_reclamos   enable row level security;
alter table public.mensajes_ticket    enable row level security;
alter table public.audit_log          enable row level security;

-- FORCE en todas las tablas con datos de cliente.
-- EXCEPCION deliberada: public.usuarios NO lleva FORCE porque los helpers
-- app.current_*() (SECURITY DEFINER, dueno = postgres) deben poder leerla; con
-- FORCE el dueno tambien queda sujeto a RLS y el sistema entero se bloquearia.
alter table public.orgs               force row level security;
alter table public.clientes           force row level security;
alter table public.api_keys_cifradas  force row level security;
alter table public.agentes            force row level security;
alter table public.registros_uso      force row level security;
alter table public.suscripciones      force row level security;
alter table public.cobros             force row level security;
alter table public.tickets_reclamos   force row level security;
alter table public.mensajes_ticket    force row level security;
alter table public.audit_log          force row level security;

-- ---------------------------------------------------------------------------
-- 7. Politicas RLS (docs/eng/02 §6). service_role bypassa RLS por diseno.
-- ---------------------------------------------------------------------------

-- 7.1 orgs: el operador ve y edita SU org. El cliente no toca orgs.
create policy orgs_operador_select on public.orgs
  for select to authenticated
  using (id = app.current_org_id() and app.current_rol() = 'operador');

create policy orgs_operador_update on public.orgs
  for update to authenticated
  using      (id = app.current_org_id() and app.current_rol() = 'operador')
  with check (id = app.current_org_id() and app.current_rol() = 'operador');

-- 7.2 clientes
create policy clientes_operador on public.clientes
  for all to authenticated
  using      (org_id = app.current_org_id() and app.current_rol() = 'operador')
  with check (org_id = app.current_org_id() and app.current_rol() = 'operador');

create policy clientes_self on public.clientes
  for select to authenticated
  using (org_id = app.current_org_id() and id = app.current_cliente_id());

-- 7.3 usuarios
create policy usuarios_operador on public.usuarios
  for all to authenticated
  using      (org_id = app.current_org_id() and app.current_rol() = 'operador')
  with check (org_id = app.current_org_id() and app.current_rol() = 'operador');

create policy usuarios_self on public.usuarios
  for select to authenticated
  using (auth_user_id = auth.uid());

-- 7.4 api_keys_cifradas: ningun usuario autenticado lee la tabla base (§6.3).
--     Metadatos solo por public.api_keys_publicas; alta/rotacion por RPC
--     security definer del backend. Sin politicas de insert/update/delete
--     -> deniega por defecto.
create policy apikeys_no_select_authenticated on public.api_keys_cifradas
  for select to authenticated
  using (false);

-- 7.5 agentes
create policy agentes_operador on public.agentes
  for all to authenticated
  using      (org_id = app.current_org_id() and app.current_rol() = 'operador')
  with check (org_id = app.current_org_id() and app.current_rol() = 'operador');

create policy agentes_cliente on public.agentes
  for select to authenticated
  using (org_id = app.current_org_id() and cliente_id = app.current_cliente_id());

-- 7.6 registros_uso: solo lectura para ambos roles; escribe el backend.
create policy uso_cliente on public.registros_uso
  for select to authenticated
  using (org_id = app.current_org_id()
         and (app.current_rol() = 'operador'
              or cliente_id = app.current_cliente_id()));

-- 7.7 suscripciones
create policy susc_operador on public.suscripciones
  for all to authenticated
  using      (org_id = app.current_org_id() and app.current_rol() = 'operador')
  with check (org_id = app.current_org_id() and app.current_rol() = 'operador');

create policy susc_cliente on public.suscripciones
  for select to authenticated
  using (org_id = app.current_org_id() and cliente_id = app.current_cliente_id());

-- 7.8 cobros: lectura para ambos; el backend crea/actualiza (Flow + DTE).
create policy cobros_lectura on public.cobros
  for select to authenticated
  using (org_id = app.current_org_id()
         and (app.current_rol() = 'operador'
              or cliente_id = app.current_cliente_id()));

-- 7.9 tickets_reclamos
create policy tickets_operador on public.tickets_reclamos
  for all to authenticated
  using      (org_id = app.current_org_id() and app.current_rol() = 'operador')
  with check (org_id = app.current_org_id() and app.current_rol() = 'operador');

create policy tickets_cliente_rw on public.tickets_reclamos
  for select to authenticated
  using (org_id = app.current_org_id() and cliente_id = app.current_cliente_id());

create policy tickets_cliente_insert on public.tickets_reclamos
  for insert to authenticated
  with check (org_id = app.current_org_id()
              and cliente_id = app.current_cliente_id()
              and (abierto_por is null or abierto_por = app.current_usuario_id()));

-- 7.10 mensajes_ticket
create policy mensajes_participante on public.mensajes_ticket
  for select to authenticated
  using (
    org_id = app.current_org_id()
    and exists (
      select 1 from public.tickets_reclamos t
      where t.id = mensajes_ticket.ticket_id
        and t.org_id = app.current_org_id()
        and (app.current_rol() = 'operador'
             or t.cliente_id = app.current_cliente_id())
    )
  );

create policy mensajes_participante_insert on public.mensajes_ticket
  for insert to authenticated
  with check (
    org_id = app.current_org_id()
    and autor_id = app.current_usuario_id()
    and autor_rol = app.current_rol()
    and exists (
      select 1 from public.tickets_reclamos t
      where t.id = mensajes_ticket.ticket_id
        and t.org_id = app.current_org_id()
        and (app.current_rol() = 'operador'
             or t.cliente_id = app.current_cliente_id())
    )
  );

-- 7.11 audit_log: solo lectura del operador; INSERT unicamente por service_role.
create policy audit_operador_read on public.audit_log
  for select to authenticated
  using (org_id = app.current_org_id() and app.current_rol() = 'operador');

-- ---------------------------------------------------------------------------
-- 8. Vistas
-- ---------------------------------------------------------------------------

-- 8.1 api_keys_publicas (§6.3): metadatos sin material criptografico.
-- Es SECURITY DEFINER (dueno postgres) porque la tabla base deniega SELECT a
-- authenticated; por eso el filtro de tenant va DENTRO de la vista. Sin sesion
-- valida, app.current_org_id() = NULL y la vista no devuelve nada.
create view public.api_keys_publicas
  with (security_barrier = true) as
  select k.id, k.cliente_id, k.org_id, k.proveedor, k.alias, k.key_last4,
         k.estado, k.created_at, k.updated_at
  from public.api_keys_cifradas k
  where k.org_id = app.current_org_id()
    and (app.current_rol() = 'operador'
         or k.cliente_id = app.current_cliente_id());
comment on view public.api_keys_publicas is
  'Unica puerta de lectura de api_keys_cifradas para el frontend. Nunca expone key_ciphertext/key_iv/key_auth_tag.';

-- 8.2 uso_diario (§4.6): agregacion para el portal del cliente.
-- security_invoker: hereda la RLS de registros_uso del usuario que consulta.
create view public.uso_diario
  with (security_invoker = true, security_barrier = true) as
  select org_id,
         cliente_id,
         agente_id,
         date_trunc('day', ocurrido_en) as dia,
         sum(unidades)                  as usos,
         sum(coalesce(tokens_in, 0))    as tokens_in,
         sum(coalesce(tokens_out, 0))   as tokens_out,
         sum(costo_estimado)            as costo_estimado,
         moneda
  from public.registros_uso
  group by org_id, cliente_id, agente_id, date_trunc('day', ocurrido_en), moneda;

-- ---------------------------------------------------------------------------
-- 9. Privilegios (defensa en profundidad: RLS + GRANTs)
--    Supabase concede por defecto TRUNCATE/REFERENCES/TRIGGER a anon y
--    authenticated sobre tablas nuevas de public. TRUNCATE ignora RLS: se revoca.
-- ---------------------------------------------------------------------------
revoke all on public.orgs, public.clientes, public.usuarios,
              public.api_keys_cifradas, public.agentes, public.registros_uso,
              public.suscripciones, public.cobros, public.tickets_reclamos,
              public.mensajes_ticket, public.audit_log,
              public.api_keys_publicas, public.uso_diario
  from anon, authenticated;

grant usage on schema app to authenticated, service_role;
revoke all on function app.current_usuario_id(), app.current_org_id(),
                       app.current_rol(), app.current_cliente_id(),
                       app.set_updated_at() from public;
grant execute on function app.current_usuario_id(), app.current_org_id(),
                          app.current_rol(), app.current_cliente_id()
  to authenticated, service_role;

-- Backend: acceso total (ya bypassa RLS, pero igual necesita privilegios).
grant all on public.orgs, public.clientes, public.usuarios,
             public.api_keys_cifradas, public.agentes, public.registros_uso,
             public.suscripciones, public.cobros, public.tickets_reclamos,
             public.mensajes_ticket, public.audit_log,
             public.api_keys_publicas, public.uso_diario
  to service_role;

-- Usuarios finales: el minimo que exige la matriz §6.1. RLS decide las filas.
grant select, update                 on public.orgs              to authenticated;
grant select, insert, update         on public.clientes          to authenticated;
grant select, insert, update, delete on public.usuarios          to authenticated;
grant select, insert, update         on public.agentes           to authenticated;
grant select                         on public.registros_uso     to authenticated;
grant select, insert, update         on public.suscripciones     to authenticated;
grant select                         on public.cobros            to authenticated;
grant select, insert, update, delete on public.tickets_reclamos  to authenticated;
grant select, insert                 on public.mensajes_ticket   to authenticated;
grant select                         on public.audit_log         to authenticated;
grant select                         on public.api_keys_publicas to authenticated;
grant select                         on public.uso_diario        to authenticated;
-- Sin DELETE en clientes / agentes / suscripciones: usan borrado logico
-- (deleted_at). Sin privilegios para authenticated en api_keys_cifradas ni
-- para anon en ninguna tabla: intencional.
