-- ============================================================================
-- Rollback de 20260826220500_api_keys_rpc_5_1.sql
-- Aplicar manualmente: supabase no revierte migraciones, solo las reaplica.
--
-- SIN perdida de datos de cliente: solo borra dos funciones, un indice y la
-- columna key_version (metadato de cifrado, no material criptografico). Los
-- ciphertext/iv/auth_tag quedan intactos.
--
-- ATENCION antes de revertir: si ya se roto la clave maestra y existen filas
-- con key_version > 1, perder esta columna deja SIN forma de saber con que
-- clave se cifro cada fila -> esos blobs se vuelven indescifrables. Verificar
-- primero:
--   select key_version, count(*) from public.api_keys_cifradas group by 1;
-- Si aparece algo distinto de 1, respaldar la tabla antes de continuar.
-- ============================================================================

drop function if exists public.revocar_api_key_cliente(uuid);
drop function if exists public.guardar_api_key_cliente(text, bytea, bytea, bytea, integer, text, text, text);

drop index if exists public.idx_apikeys_key_version;

alter table public.api_keys_cifradas
  drop constraint if exists chk_apikeys_key_version;
alter table public.api_keys_cifradas
  drop column if exists key_version;
