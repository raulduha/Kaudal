-- ============================================================================
-- ROLLBACK de supabase/migrations/20260827200000_tickets_adjuntos_9_1.sql
--
-- Deshace en orden inverso. Sin perdida de datos:
--   · Ningun DROP TABLE, ningun DELETE de tickets ni de mensajes.
--   · Los valores que el backfill puso en ultimo_mensaje_en SE QUEDAN (eran
--     NULL antes; dejarlos es mas informativo que volverlos a vaciar, y la
--     columna vuelve a ser nullable igual que antes).
--   · La fila del bucket solo se borra si NO tiene objetos. Si hay adjuntos
--     subidos, aborta con un mensaje claro: borrar el bucket dejaria archivos
--     huerfanos en el backend de storage y filas irrecuperables.
-- ============================================================================

-- 8. Adjuntos ---------------------------------------------------------------
alter table public.mensajes_ticket drop constraint if exists chk_mensajes_adjuntos;
comment on column public.mensajes_ticket.adjuntos is null;

drop policy if exists adjuntos_ticket_insert on storage.objects;
drop policy if exists adjuntos_ticket_select on storage.objects;

do $$
declare
  v_objetos bigint;
begin
  select count(*) into v_objetos
  from storage.objects
  where bucket_id = 'ticket-attachments';

  if v_objetos > 0 then
    raise exception
      'El bucket ticket-attachments tiene % objeto(s). Respalda y vacia el bucket con la Storage API antes de revertir esta migracion.',
      v_objetos
      using errcode = '2BP01';
  end if;

  -- storage trae el trigger protect_buckets_delete, que bloquea el DELETE por
  -- SQL directo salvo que se declare la intencion con este GUC. Va `true` en
  -- el tercer argumento: es LOCAL a la transaccion del rollback, no queda
  -- activo para nadie mas.
  perform set_config('storage.allow_delete_query', 'true', true);
  delete from storage.buckets where id = 'ticket-attachments';
end $$;

drop function if exists app.puede_tocar_adjunto_ticket(text);
drop function if exists app.uuid_o_null(text);

-- 7. Tope de creacion -------------------------------------------------------
drop trigger if exists trg_tickets_cupo on public.tickets_reclamos;
drop function if exists app.exigir_cupo_tickets();

-- 6. RPC de marcas de leido -------------------------------------------------
drop function if exists public.marcar_mensajes_leidos(uuid);

-- 5. Auditoria --------------------------------------------------------------
drop trigger if exists trg_tickets_auditar_cambios on public.tickets_reclamos;
drop trigger if exists trg_tickets_auditar_alta    on public.tickets_reclamos;
drop function if exists app.auditar_ticket();
-- Las filas ya escritas en audit_log NO se tocan: la tabla es append-only y
-- las reglas DO INSTEAD NOTHING de 2.1 ignorarian el DELETE de todas formas.

-- 4. Maquina de estados en el hilo -----------------------------------------
drop trigger if exists trg_mensajes_aplicar_en_ticket on public.mensajes_ticket;
drop function if exists app.mensajes_aplicar_en_ticket();

-- 3. Marcas de leido en el INSERT ------------------------------------------
drop trigger if exists trg_mensajes_normalizar on public.mensajes_ticket;
drop function if exists app.mensajes_normalizar();

-- 2. ultimo_mensaje_en / cerrado_en ----------------------------------------
alter table public.tickets_reclamos
  alter column ultimo_mensaje_en drop not null,
  alter column ultimo_mensaje_en drop default;

drop trigger if exists trg_tickets_normalizar on public.tickets_reclamos;
drop function if exists app.tickets_normalizar();

comment on column public.tickets_reclamos.ultimo_mensaje_en is null;
comment on column public.tickets_reclamos.cerrado_en is null;

-- 1. Indices y columna generada --------------------------------------------
drop index if exists public.idx_mensajes_no_leidos_por_ticket;
drop index if exists public.idx_tickets_cliente_creado;
drop index if exists public.idx_tickets_kanban;

alter table public.tickets_reclamos drop column if exists prioridad_peso;
