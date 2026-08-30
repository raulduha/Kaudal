-- ============================================================================
-- Kaudal · Nota interna en mensajes_ticket (Tarea 2.2, hallazgo ALTO-1)
--
-- security-auditor detecto que docs/eng/08 (S2, S8.3) exige que el cliente
-- JAMAS vea notas internas del operador ("El cliente jamas ve tickets de otra
-- org ni notas internas... flag is_internal filtrado en la API/RLS"), pero
-- docs/eng/02 S4.10 (y la migracion 20260826125600 que lo implemento fiel al
-- doc) no tenia esa columna: mensajes_ticket no distinguia nota interna de
-- mensaje visible para el cliente. No es explotable hoy (no existe bandeja de
-- operador todavia, Fase 9), pero el candado de RLS es el entregable de esta
-- tarea 2.2 -- si se construye la bandeja despues sin volver a tocar RLS, la
-- nota interna se filtra al portal del cliente.
--
-- Rollback: supabase/rollbacks/20260826170000_mensajes_nota_interna_down.sql
-- ============================================================================

alter table public.mensajes_ticket
  add column es_interno boolean not null default false;
comment on column public.mensajes_ticket.es_interno is
  'true = nota interna del operador (no visible para el cliente). Filtrado en RLS, no solo en la app.';

-- Reemplaza la politica de SELECT: el cliente nunca ve es_interno = true,
-- aunque el mensaje pertenezca a uno de sus propios tickets.
drop policy mensajes_participante on public.mensajes_ticket;
create policy mensajes_participante on public.mensajes_ticket
  for select to authenticated
  using (
    org_id = app.current_org_id()
    and (app.current_rol() = 'operador' or es_interno = false)
    and exists (
      select 1 from public.tickets_reclamos t
      where t.id = mensajes_ticket.ticket_id
        and t.org_id = app.current_org_id()
        and (app.current_rol() = 'operador'
             or t.cliente_id = app.current_cliente_id())
    )
  );

-- El cliente no puede marcar su propio mensaje como nota interna.
drop policy mensajes_participante_insert on public.mensajes_ticket;
create policy mensajes_participante_insert on public.mensajes_ticket
  for insert to authenticated
  with check (
    org_id = app.current_org_id()
    and autor_id = app.current_usuario_id()
    and autor_rol = app.current_rol()
    and (app.current_rol() = 'operador' or es_interno = false)
    and exists (
      select 1 from public.tickets_reclamos t
      where t.id = mensajes_ticket.ticket_id
        and t.org_id = app.current_org_id()
        and (app.current_rol() = 'operador'
             or t.cliente_id = app.current_cliente_id())
    )
  );
