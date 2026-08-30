-- ============================================================================
-- Rollback de 20260826170000_mensajes_nota_interna.sql
-- Aplicar manualmente: supabase no revierte migraciones, solo las reaplica.
-- ============================================================================

drop policy mensajes_participante_insert on public.mensajes_ticket;
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

drop policy mensajes_participante on public.mensajes_ticket;
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

alter table public.mensajes_ticket drop column es_interno;
