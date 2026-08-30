-- ============================================================================
-- Rollback de 20260827093000_limite_api_keys_rpc.sql
-- Aplicar manualmente: supabase no revierte migraciones, solo las reaplica.
--
-- SIN perdida de datos: no toca ninguna fila. Solo borra un indice y una
-- funcion, y deja las dos RPC exactamente como las dejo
-- 20260826220500_api_keys_rpc_5_1.sql (sin la llamada al guardia). Los dos
-- bloques `create or replace function` de mas abajo son copia textual de esa
-- migracion; la unica diferencia con el cuerpo vigente son las dos lineas
-- `perform app.exigir_cupo_api_keys(v_org, v_cliente);` que desaparecen.
--
-- ATENCION antes de revertir: esto REABRE el hallazgo MEDIO-1 de la auditoria
-- de 5.1. Sin app.exigir_cupo_api_keys, cualquier cliente autenticado que
-- llame POST /rest/v1/rpc/guardar_api_key_cliente directo por PostgREST puede
-- insertar filas ilimitadas en api_keys_cifradas y en audit_log, que es
-- append-only (ni service_role puede limpiarla): el dano NO se puede deshacer
-- despues. Revertir solo si el guardia esta causando un problema peor, y
-- volver a aplicarlo apenas se pueda.
--
-- Forma correcta de aflojar el limite SIN revertir nada: cambiar c_max o
-- c_ventana dentro de app.exigir_cupo_api_keys con una migracion nueva.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Devolver las dos RPC a su cuerpo de 5.1 (sin el guardia).
--    Va PRIMERO: mientras exista una funcion que llame a
--    app.exigir_cupo_api_keys, borrarla dejaria las RPC rotas en tiempo de
--    ejecucion (plpgsql resuelve la llamada recien al ejecutarse).
-- ---------------------------------------------------------------------------
create or replace function public.guardar_api_key_cliente(
  p_proveedor       text,
  p_key_ciphertext  bytea,
  p_key_iv          bytea,
  p_key_auth_tag    bytea,
  p_key_version     integer,
  p_alias           text default null,
  p_key_last4       text default null,
  p_key_fingerprint text default null
)
returns table (
  id         uuid,
  proveedor  text,
  alias      text,
  key_last4  text,
  estado     text,
  created_at timestamptz
)
language plpgsql security definer set search_path = '' as $fn$
declare
  v_org       uuid := app.current_org_id();
  v_cliente   uuid := app.current_cliente_id();
  v_rol       text := app.current_rol();
  v_usuario   uuid := app.current_usuario_id();
  v_alias     text := nullif(pg_catalog.btrim(coalesce(p_alias, '')), '');
  v_last4     text := nullif(pg_catalog.btrim(coalesce(p_key_last4, '')), '');
  v_rotada_de uuid;
  v_nueva     uuid;
begin
  -- Guarda de rol/tenant. Mismo mensaje para "no eres cliente" y "no tienes
  -- sesion": no se le confirma nada a quien no corresponde.
  if v_rol is distinct from 'cliente' or v_org is null or v_cliente is null then
    raise exception 'No tienes permiso para guardar una API key.'
      using errcode = '42501';
  end if;

  -- Material criptografico: solo presencia. El largo exacto del iv (12 bytes
  -- GCM) y del tag (16 bytes) lo valida el backend, que es quien conoce el
  -- algoritmo; fijarlo aca amarraria la BD a AES-256-GCM para siempre.
  if p_key_ciphertext is null or pg_catalog.length(p_key_ciphertext) = 0
     or p_key_iv is null or pg_catalog.length(p_key_iv) = 0
     or p_key_auth_tag is null or pg_catalog.length(p_key_auth_tag) = 0
     or p_key_version is null or p_key_version < 1 then
    raise exception 'No pudimos guardar la API key. Intentalo de nuevo.'
      using errcode = '22023';
  end if;

  if v_alias is not null and pg_catalog.length(v_alias) > 60 then
    raise exception 'El nombre de la API key es demasiado largo (maximo 60 caracteres).'
      using errcode = '22023';
  end if;

  if v_last4 is not null and pg_catalog.length(v_last4) > 4 then
    raise exception 'No pudimos guardar la API key. Intentalo de nuevo.'
      using errcode = '22023';
  end if;

  -- El proveedor NO se valida aca: lo hace el CHECK de la tabla
  -- (anthropic|openai|otro). Una sola fuente de verdad.

  -- Rotacion: toda key activa del mismo (cliente, proveedor, alias) pasa a
  -- revocada. `is not distinct from` cubre el alias NULL, que el indice unico
  -- parcial NO agrupa (en Postgres los NULL son distintos entre si): sin esto,
  -- el cliente que no pone alias acumularia keys activas duplicadas.
  with revocadas as (
    update public.api_keys_cifradas k
       set estado = 'revocada'
     where k.cliente_id = v_cliente
       and k.org_id     = v_org
       and k.proveedor  = p_proveedor
       and k.alias is not distinct from v_alias
       and k.estado     = 'activa'
    returning k.id as rid, k.created_at as rcreated
  )
  select r.rid into v_rotada_de
  from revocadas r
  order by r.rcreated desc, r.rid desc
  limit 1;

  begin
    insert into public.api_keys_cifradas (
      cliente_id, org_id, proveedor, alias,
      key_ciphertext, key_iv, key_auth_tag,
      key_last4, key_fingerprint, key_version,
      estado, rotada_de
    ) values (
      v_cliente, v_org, p_proveedor, v_alias,
      p_key_ciphertext, p_key_iv, p_key_auth_tag,
      v_last4,
      nullif(pg_catalog.btrim(coalesce(p_key_fingerprint, '')), ''),
      p_key_version,
      'activa', v_rotada_de
    )
    returning public.api_keys_cifradas.id into v_nueva;
  exception
    -- Dos altas simultaneas del mismo (cliente, proveedor, alias): una gana.
    when unique_violation then
      raise exception 'Ya estas guardando otra API key con ese mismo nombre. Intentalo de nuevo.'
        using errcode = '23505';
    -- FUGA QUE ESTO TAPA: el DETAIL de una violacion de CHECK/NOT NULL trae la
    -- FILA COMPLETA ("Failing row contains (..., \x01, \x02, \x03, ...)"), o
    -- sea ciphertext + iv + auth_tag. PostgREST devuelve ese detail al
    -- navegador y ademas queda en los logs de Postgres. docs/eng/03 principio
    -- 3: ese material NUNCA aparece en un mensaje de error. Se atrapa y se
    -- responde generico. Hoy el unico CHECK alcanzable desde aca es el de
    -- `proveedor` (el resto se valida antes); la lista permitida sigue viviendo
    -- solo en la tabla, sin duplicarse en esta funcion.
    when check_violation or not_null_violation then
      raise exception 'No pudimos guardar la API key. Revisa el proveedor e intentalo de nuevo.'
        using errcode = '22023';
  end;

  -- Auditoria (CLAUDE.md regla 5). Solo metadatos: jamas ciphertext, iv, tag
  -- ni la key en claro (que esta funcion nunca recibe).
  insert into public.audit_log (org_id, actor_id, actor_rol, accion,
                                entidad, entidad_id, datos)
  values (
    v_org, v_usuario, 'cliente',
    case when v_rotada_de is null then 'api_key.alta' else 'api_key.rotacion' end,
    'api_keys_cifradas', v_nueva,
    pg_catalog.jsonb_build_object(
      'proveedor',   p_proveedor,
      'alias',       v_alias,
      'key_last4',   v_last4,
      'key_version', p_key_version,
      'rotada_de',   v_rotada_de
    )
  );

  return query
    select k.id, k.proveedor, k.alias, k.key_last4, k.estado, k.created_at
    from public.api_keys_cifradas k
    where k.id = v_nueva;
end
$fn$;

comment on function public.guardar_api_key_cliente(text, bytea, bytea, bytea, integer, text, text, text) is
  'Unica via por la que un cliente da de alta o rota su API key. Recibe SOLO bytes ya cifrados por el backend (nunca la key en claro), toma org_id/cliente_id de la sesion, revoca la key activa anterior del mismo proveedor+alias encadenandola con rotada_de, y devuelve solo metadatos (jamas ciphertext/iv/auth_tag).';
create or replace function public.revocar_api_key_cliente(p_id uuid)
returns table (
  id         uuid,
  proveedor  text,
  alias      text,
  key_last4  text,
  estado     text,
  created_at timestamptz
)
language plpgsql security definer set search_path = '' as $fn$
declare
  v_org     uuid := app.current_org_id();
  v_cliente uuid := app.current_cliente_id();
  v_rol     text := app.current_rol();
  v_usuario uuid := app.current_usuario_id();
  v_estado  text;
begin
  if v_rol is distinct from 'cliente' or v_org is null or v_cliente is null then
    raise exception 'No tienes permiso para revocar esta API key.'
      using errcode = '42501';
  end if;

  -- Se leen solo las columnas no sensibles: el ciphertext ni siquiera entra a
  -- una variable de esta funcion.
  select k.estado into v_estado
  from public.api_keys_cifradas k
  where k.id = p_id
    and k.org_id     = v_org
    and k.cliente_id = v_cliente
  for update;

  -- Mismo error para "no existe" y "es de otro cliente": no se filtra cual de
  -- los dos casos es (mismo patron que cambiar_estado_mi_ticket).
  if not found then
    raise exception 'No encontramos esa API key.' using errcode = '42501';
  end if;

  if v_estado = 'activa' then
    update public.api_keys_cifradas k
       set estado = 'revocada'
     where k.id = p_id
       and k.org_id     = v_org
       and k.cliente_id = v_cliente;

    insert into public.audit_log (org_id, actor_id, actor_rol, accion,
                                  entidad, entidad_id, datos)
    values (v_org, v_usuario, 'cliente', 'api_key.revocacion',
            'api_keys_cifradas', p_id, '{}'::jsonb);
  end if;

  return query
    select k.id, k.proveedor, k.alias, k.key_last4, k.estado, k.created_at
    from public.api_keys_cifradas k
    where k.id = p_id;
end
$fn$;

comment on function public.revocar_api_key_cliente(uuid) is
  'El cliente revoca (estado = revocada) una API key SUYA. Baja logica: no borra la fila para no romper agentes ni la cadena de rotacion. Si la key no existe o es de otro cliente, error generico identico.';

-- ---------------------------------------------------------------------------
-- 2. Recien ahora el guardia y su indice.
-- ---------------------------------------------------------------------------
drop function if exists app.exigir_cupo_api_keys(uuid, uuid);

drop index if exists public.idx_audit_apikey_actor_fecha;
