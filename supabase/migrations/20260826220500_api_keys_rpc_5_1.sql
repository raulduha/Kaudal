-- ============================================================================
-- Kaudal · Alta / rotacion / revocacion de API keys de cliente (Tarea 5.1)
--
-- Fuentes: docs/eng/03-seguridad-y-api-keys.md §2.3 (estructura del blob
--          cifrado y `key_id`), §2.4 (rotacion de clave maestra sin re-cifrado
--          masivo), §2.6 (actualizar = reemplazar ciphertext completo, nunca
--          edicion parcial); docs/eng/02-modelo-de-datos.md §4.4 y §6.3
--          ("alta/rotacion se hacen por RPC security definer... el cliente
--          nunca inserta ciphertext desde el navegador").
--
-- CONTEXTO
--   `authenticated` NO tiene ningun privilegio sobre public.api_keys_cifradas
--   (ni SELECT ni INSERT): es intencional desde 20260826125600 seccion 9. La
--   lectura de metadatos pasa por la vista public.api_keys_publicas y la
--   escritura pasa, desde esta migracion, unicamente por dos funciones
--   SECURITY DEFINER. Esta migracion NO agrega ningun GRANT sobre la tabla
--   base: sigue en cero.
--
-- QUE AGREGA
--   1. api_keys_cifradas.key_version -> que clave maestra cifro esa fila.
--   2. public.guardar_api_key_cliente(...)  -> alta + rotacion (reemplazo).
--   3. public.revocar_api_key_cliente(uuid) -> revocacion logica.
--   Ambas funciones: SECURITY DEFINER, search_path vacio, tenant tomado SOLO
--   de app.current_*(), jamas de un parametro, y sin devolver nunca material
--   criptografico (mismo contrato que la vista api_keys_publicas).
--
-- LO QUE ESTAS FUNCIONES NO HACEN (a proposito)
--   No cifran. El cifrado AES-256-GCM ocurre en el backend con la clave
--   maestra de KAUDAL_MASTER_KEY (fuera de la BD, docs/eng/03 seccion 2.3). La
--   BD solo persiste bytes opacos: nunca recibe ni puede recibir la key en
--   claro.
--
-- Rollback: supabase/rollbacks/20260826220500_api_keys_rpc_5_1_down.sql
-- Reversible y sin perdida de datos: agrega una columna con default y dos
-- funciones nuevas. No borra filas, no toca politicas RLS ni privilegios de
-- tabla existentes.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. key_version: identificador de la clave maestra usada para cifrar la fila
--
--    docs/eng/03 seccion 2.3 lo llama `key_id` dentro del blob. Se guarda como
--    columna aparte (y no dentro del ciphertext) porque la seccion 2.4 exige
--    poder responder "que filas siguen cifradas con la clave vieja?" SIN
--    descifrar nada: el job de re-cifrado progresivo filtra por esta columna.
--
--    Nombre elegido: `key_version` (integer) en vez de `key_id` (uuid/text).
--    Razon: la clave maestra no es una entidad en la BD (vive en env/KMS), asi
--    que un "id" sugeriria una FK inexistente; lo que la app necesita saber es
--    el ordinal de la clave en uso (KAUDAL_MASTER_KEY_V1, _V2, ...). El
--    default 1 documenta que todo lo cifrado hasta hoy usa la clave v1.
--
--    NOTA para el futuro: esta columna versiona la CLAVE, no el ALGORITMO.
--    Si algun dia se migra de AES-256-GCM a otro esquema (la seccion 2.3
--    menciona libsodium secretbox), hara falta una segunda columna
--    (`cifrado_alg`). No se agrega ahora para no crear una columna muerta.
-- ---------------------------------------------------------------------------
alter table public.api_keys_cifradas
  add column key_version integer not null default 1
    constraint chk_apikeys_key_version check (key_version >= 1);

comment on column public.api_keys_cifradas.key_version is
  'Version de la clave maestra (env/KMS) con la que se cifro ESTA fila. Permite rotar la clave maestra sin re-cifrar todo de inmediato (docs/eng/03 2.4): las filas nuevas nacen con la version vigente y un job re-cifra las viejas. No versiona el algoritmo.';

-- Indice para el job de re-cifrado de la seccion 2.4: "traeme las keys activas
-- que siguen en la clave vieja". Sin el, ese barrido es un seq scan de la
-- tabla mas sensible del sistema. Parcial porque una key revocada no se
-- re-cifra: se deja morir con su clave vieja o se purga.
create index idx_apikeys_key_version
  on public.api_keys_cifradas(key_version)
  where estado = 'activa';

-- ---------------------------------------------------------------------------
-- 2. guardar_api_key_cliente: alta y rotacion
--
--    docs/eng/03 seccion 2.6: "Actualizar reemplaza el ciphertext completo
--    (nuevo nonce). No hay editar parcial." Por eso no existe un RPC de
--    UPDATE: el cliente siempre manda una key nueva y esta funcion revoca la
--    anterior y encadena la nueva con `rotada_de`. Asi tambien se evita chocar
--    con el indice unico parcial uq_apikeys_alias_activa(cliente_id,
--    proveedor, alias) where estado = 'activa'.
--
--    org_id / cliente_id salen SIEMPRE de los helpers de sesion. No hay
--    parametro para el tenant: aunque el frontend fuera hostil, no existe
--    forma de escribirle una key a otra empresa.
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

-- ---------------------------------------------------------------------------
-- 3. revocar_api_key_cliente: baja logica
--
--    No borra la fila: `agentes.api_key_id` referencia api_keys_cifradas con
--    ON DELETE RESTRICT y la cadena `rotada_de` es historial. El borrado duro
--    (purga por baja de cuenta / derecho de supresion, docs/eng/03 seccion
--    9.2) es tarea del backend con service_role, no del cliente desde el
--    navegador. Idempotente: revocar dos veces no es error.
-- ---------------------------------------------------------------------------
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
-- 4. Privilegios
--    Mismo patron que los RPC de 2.2. `revoke ... from public` quita el
--    EXECUTE implicito de PUBLIC; el revoke nominal a `anon` es redundante hoy
--    (20260826163000 apago los default privileges) pero se deja explicito para
--    que la funcion siga cerrada aunque alguien reactive esos defaults: estas
--    dos funciones son SECURITY DEFINER sobre la tabla mas sensible del
--    sistema y PostgREST las publica en /rest/v1/rpc/ con la sola anon key.
--    NO se concede ningun privilegio sobre public.api_keys_cifradas: el acceso
--    de `authenticated` a esa tabla sigue siendo exactamente cero.
-- ---------------------------------------------------------------------------
revoke all on function public.guardar_api_key_cliente(text, bytea, bytea, bytea, integer, text, text, text) from public, anon;
revoke all on function public.revocar_api_key_cliente(uuid) from public, anon;

grant execute on function public.guardar_api_key_cliente(text, bytea, bytea, bytea, integer, text, text, text) to authenticated, service_role;
grant execute on function public.revocar_api_key_cliente(uuid) to authenticated, service_role;
