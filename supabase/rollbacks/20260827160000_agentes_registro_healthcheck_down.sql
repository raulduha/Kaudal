-- ============================================================================
-- Rollback de 20260827160000_agentes_registro_healthcheck.sql
-- Aplicar manualmente: supabase no revierte migraciones, solo las reaplica.
--
-- ATENCION · UNICA PERDIDA DE DATOS POSIBLE
--   Revertir borra las columnas canal, health_url, ultimo_healthcheck_*,
--   healthcheck_fallos_consecutivos y TODO el material de auth cifrado
--   (auth_ciphertext / auth_iv / auth_tag / auth_version / auth_header_nombre /
--   auth_tipo). Esos secretos NO se pueden reconstruir: el operador tendria que
--   volver a pegarlos agente por agente.
--   Antes de correr esto, respaldar:
--     \copy (select id, cliente_id, nombre, canal, health_url, auth_tipo,
--                   auth_header_nombre, auth_version,
--                   encode(auth_ciphertext,'base64') as auth_ciphertext_b64,
--                   encode(auth_iv,'base64')         as auth_iv_b64,
--                   encode(auth_tag,'base64')        as auth_tag_b64
--            from public.agentes where auth_tipo <> 'none')
--       to 'respaldo_agentes_auth.csv' csv header
--   Ese respaldo contiene material criptografico: tratarlo como secreto,
--   borrarlo apenas se confirme la restauracion.
--
--   Ninguna FILA se borra. El resto (indices, vista, grants) vuelve exacto al
--   estado de 20260827093000.
-- ============================================================================

-- 1. Vista y grants de lectura: volver al GRANT de tabla completa que dejo
--    20260826125600 seccion 9 (`grant select, insert, update ... to
--    authenticated`). Primero se sueltan los privilegios por columna, porque un
--    GRANT de tabla no los reemplaza: conviven y quedarian colgando.
drop view if exists public.agentes_publicos;

revoke select (
  id, org_id, cliente_id, nombre, descripcion, tipo, canal,
  endpoint_url, health_url, metodo_reporte, modelo_default, api_key_id,
  auth_tipo, auth_header_nombre,
  estado, ultimo_healthcheck_en, ultimo_healthcheck_ok,
  healthcheck_fallos_consecutivos,
  deleted_at, created_at, updated_at
) on public.agentes from authenticated;

grant select on public.agentes to authenticated;

-- 2. Indices
drop index if exists public.idx_agentes_healthcheck_pendiente;
drop index if exists public.idx_agentes_org_estado;

-- 3. estado: volver a la lista de tres valores.
--    Los agentes que quedaron en 'caido' pasan a 'pausado' ANTES de reponer el
--    CHECK viejo; si no, el ALTER falla. 'pausado' es la traduccion menos
--    danina: el agente queda visiblemente fuera de servicio en vez de aparecer
--    'activo' cuando no responde (que es justo el estado mentiroso que esta
--    migracion vino a arreglar).
update public.agentes set estado = 'pausado' where estado = 'caido';

alter table public.agentes drop constraint if exists agentes_estado_check;
alter table public.agentes
  add constraint agentes_estado_check
  check (estado in ('activo','pausado','archivado'));

comment on column public.agentes.estado is null;

-- 4. Columnas nuevas. DROP COLUMN se lleva sus propios CHECK y comentarios,
--    incluido chk_agentes_auth (que referencia varias de ellas).
alter table public.agentes
  drop constraint if exists chk_agentes_auth,
  drop constraint if exists chk_agentes_healthcheck,
  drop column if exists auth_header_nombre,
  drop column if exists auth_version,
  drop column if exists auth_tag,
  drop column if exists auth_iv,
  drop column if exists auth_ciphertext,
  drop column if exists auth_tipo,
  drop column if exists healthcheck_fallos_consecutivos,
  drop column if exists ultimo_healthcheck_ok,
  drop column if exists ultimo_healthcheck_en,
  drop column if exists health_url,
  drop column if exists canal;
