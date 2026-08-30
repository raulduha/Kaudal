-- ============================================================================
-- ROLLBACK de
--   supabase/migrations/20260827210000_tickets_adjuntos_9_1_seguimiento.sql
--
-- Devuelve el bucket ticket-attachments al estado exacto que dejo la migracion
-- 20260827200000 (9.1): ruta de 2 segmentos, sin tope de objetos.
--
-- SIN PERDIDA DE DATOS
--   Ningun DROP TABLE, ningun DELETE, ninguna fila tocada. Solo se reemplazan
--   dos funciones y el WITH CHECK de una policy.
--
-- PERO OJO: NO ES INOCUO SI YA HAY ADJUNTOS SUBIDOS
--   Los objetos escritos con la ruta nueva tienen TRES segmentos. La version
--   v1 de app.puede_tocar_adjunto_ticket() exige exactamente DOS, asi que
--   despues de revertir esos objetos quedan invisibles e indescargables para
--   todo el mundo salvo service_role. Los bytes siguen ahi (no se pierde
--   nada), pero el hilo del ticket mostraria chips de adjuntos que no abren.
--   Peor todavia: al volver a la ruta de 2 segmentos reaparece el hallazgo
--   ALTO --el cliente vuelve a poder leer el adjunto de una nota interna de su
--   propio ticket--, asi que esto NO deberia revertirse por comodidad.
--
--   Por eso el bloque de la seccion 1 ABORTA si encuentra objetos de 3
--   segmentos, con el mismo criterio del rollback de 9.1 (que aborta si el
--   bucket no esta vacio). Escape explicito, para una decision consciente de
--   DBA y no un descuido:
--
--     begin;
--       select set_config('kaudal.forzar_rollback_adjuntos', 'true', true);
--       \i supabase/rollbacks/20260827210000_..._down.sql
--     commit;
-- ============================================================================


-- 1. Guardia: adjuntos que quedarian huerfanos ------------------------------
do $$
declare
  v_tres_segmentos bigint;
  v_forzado        boolean := pg_catalog.coalesce(
    pg_catalog.current_setting('kaudal.forzar_rollback_adjuntos', true), 'false'
  ) = 'true';
begin
  select pg_catalog.count(*)
    into v_tres_segmentos
  from storage.objects o
  where o.bucket_id = 'ticket-attachments'
    and pg_catalog.array_length(storage.foldername(o.name), 1) = 3;

  if v_tres_segmentos > 0 and not v_forzado then
    raise exception
      'Hay % adjunto(s) con la ruta nueva de 3 segmentos. Revertir los deja inalcanzables desde la app y reabre el hallazgo ALTO (el cliente vuelve a leer los adjuntos de notas internas de su ticket).',
      v_tres_segmentos
      using errcode = '2BP01',
            hint    = 'Mueve los objetos a rutas de 2 segmentos con la Storage API (copy + delete, service_role) o declara la intencion con: select set_config(''kaudal.forzar_rollback_adjuntos'', ''true'', true);';
  end if;

  if v_tres_segmentos > 0 then
    raise warning
      'Rollback forzado con % adjunto(s) de 3 segmentos: quedan solo alcanzables con service_role.',
      v_tres_segmentos;
  end if;
end $$;


-- 2. La policy de INSERT vuelve a su WITH CHECK original (sin tope) ---------
--    Va ANTES de borrar app.hay_cupo_adjuntos_ticket(): mientras la policy la
--    referencie, el DROP falla por dependencia.
alter policy adjuntos_ticket_insert on storage.objects
  with check (bucket_id = 'ticket-attachments'
              and app.puede_tocar_adjunto_ticket(name));

drop function if exists app.hay_cupo_adjuntos_ticket(text);


-- 3. app.puede_tocar_adjunto_ticket() vuelve a la v1 de 9.1 -----------------
--    Copia literal de la migracion 20260827200000 §8.3: ruta de dos segmentos
--    {org_id}/{ticket_id}/{archivo}, sin visibilidad y sin exigir forma
--    canonica del uuid. Se recrea con CREATE OR REPLACE (no DROP) para no
--    tener que tocar las dos policies que la referencian.
create or replace function app.puede_tocar_adjunto_ticket(p_name text)
returns boolean
language plpgsql stable security definer set search_path = '' as $fn$
declare
  v_org      uuid := app.current_org_id();
  v_rol      text := app.current_rol();
  v_cliente  uuid := app.current_cliente_id();
  v_partes   text[];
  v_org_ruta uuid;
  v_ticket   uuid;
begin
  if v_org is null or v_rol is null then
    return false;
  end if;

  v_partes := storage.foldername(p_name);
  if pg_catalog.array_length(v_partes, 1) is distinct from 2 then
    return false;
  end if;

  v_org_ruta := app.uuid_o_null(v_partes[1]);
  v_ticket   := app.uuid_o_null(v_partes[2]);
  if v_org_ruta is null or v_ticket is null then
    return false;
  end if;

  if v_org_ruta <> v_org then
    return false;
  end if;

  return exists (
    select 1
    from public.tickets_reclamos t
    where t.id = v_ticket
      and t.org_id = v_org
      and (v_rol = 'operador' or t.cliente_id = v_cliente)
  );
end
$fn$;

comment on function app.puede_tocar_adjunto_ticket(text) is
  'Autoriza un objeto del bucket ticket-attachments segun su ruta {org_id}/{ticket_id}/{archivo}: exige que el primer segmento sea la org de la sesion y que el segundo sea un ticket que quien llama puede ver (el operador, cualquiera de su org; el cliente, solo los suyos). Cualquier ruta con otra forma se niega.';

revoke all on function app.puede_tocar_adjunto_ticket(text) from public, anon;
grant execute on function app.puede_tocar_adjunto_ticket(text)
  to authenticated, service_role;


-- 4. El comentario de la columna vuelve a describir la ruta de 2 segmentos --
comment on column public.mensajes_ticket.adjuntos is
  'Arreglo JSON con los adjuntos del mensaje, maximo 5 (docs/eng/08 §7). Forma esperada: [{"ruta": "{org_id}/{ticket_id}/{uuid}-archivo.png", "nombre": "captura.png", "mime": "image/png", "tamano_bytes": 12345}]. `ruta` apunta al objeto en el bucket ticket-attachments; el frontend nunca guarda una URL, siempre pide una firmada al backend.';

-- RECORDATORIO: si se revierte esta migracion hay que revertir tambien el lado
-- de la app (src/lib/tickets/adjuntos.ts sigue armando rutas de 3 segmentos y
-- toda subida fallaria con "new row violates row-level security policy").
