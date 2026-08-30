-- ============================================================================
-- Kaudal · Limite de abuso DENTRO de la BD para los RPC de API keys
--
-- Cierra el hallazgo MEDIO-1 de la auditoria de la Tarea 5.1 (security-auditor):
--   "El RPC es alcanzable directo por PostgREST: el rate limit y TODA la
--    validacion de la app son opcionales. 30 de 30 llamadas aceptadas sin un
--    solo 429."
--
-- Por que la app no alcanza: app/src/lib/auth/rate-limit.ts vive en la memoria
-- del proceso Next.js. Un cliente autenticado que saca su JWT y hace
-- POST /rest/v1/rpc/guardar_api_key_cliente NUNCA pasa por ese codigo: se salta
-- el regex de formato, el ping al proveedor y el limite de 10/min por org.
-- No cruza tenants (org_id/cliente_id salen de app.current_*()), pero permite
-- filas ilimitadas en la tabla mas sensible del sistema y, peor, una fila por
-- llamada en public.audit_log, que es append-only y no se puede borrar ni con
-- service_role (20260826141500): crecimiento permanente e ilimitado de una
-- tabla compartida, provocable por cualquier cliente.
--
-- La unica capa que un atacante no puede saltarse es la BD. Por eso el tope
-- vive aca, no en la app (la app conserva su 10/min como primera barrera y
-- para poder responder un 429 amable con Retry-After).
--
-- QUE AGREGA
--   1. app.exigir_cupo_api_keys(org, cliente) -> cuenta las acciones
--      'api_key.%' recientes de ese cliente en audit_log y lanza excepcion si
--      excede el tope. Sin tabla nueva: audit_log YA registra cada alta,
--      rotacion y revocacion, con actor_id -> es la fuente de verdad mas
--      directa. Una tabla de rate-limit dedicada seria un segundo registro del
--      mismo hecho, que ademas habria que purgar (y purgar es justo lo que
--      audit_log no permite).
--   2. Un indice parcial que hace ese conteo barato.
--   3. create or replace de las dos RPC de 5.1 llamando al guardia como primer
--      paso despues de la guarda de rol, ANTES de tocar nada.
--
-- Rollback: supabase/rollbacks/20260827093000_limite_api_keys_rpc_down.sql
-- Reversible y sin perdida de datos: no borra ni modifica ninguna fila, no
-- toca politicas RLS ni privilegios de tabla. Solo agrega una funcion, un
-- indice, y reemplaza el cuerpo de dos funciones.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Indice para el conteo del guardia
--
--    El guardia pregunta: "cuantas acciones api_key.* hizo este cliente en la
--    ultima hora". Los indices de 20260826125600 no sirven bien para eso:
--    idx_audit_actor(actor_id) no tiene la fecha (habria que visitar TODAS las
--    filas historicas del actor) y idx_audit_accion_fecha(accion, created_at)
--    no tiene el actor. Este indice cubre los tres filtros.
--
--    Parcial (where accion like 'api_key.%') para que no crezca con el resto
--    de la auditoria, que es la mayoria del volumen: solo indexa las filas que
--    este guardia mira. El predicado calza literalmente con el WHERE de la
--    funcion, que es lo que exige el planificador para poder usarlo.
-- ---------------------------------------------------------------------------
create index if not exists idx_audit_apikey_actor_fecha
  on public.audit_log (actor_id, created_at desc)
  where accion like 'api_key.%';

comment on index public.idx_audit_apikey_actor_fecha is
  'Sostiene el conteo de app.exigir_cupo_api_keys (limite de abuso de los RPC de API keys). Parcial: solo indexa filas de auditoria de acciones api_key.*';

-- ---------------------------------------------------------------------------
-- 2. app.exigir_cupo_api_keys: el guardia
--
--    VENTANA Y TOPE (y por que estos numeros)
--      30 acciones por hora, por CLIENTE (no por org).
--      - Por cliente y no por org: un cliente abusivo no puede dejar sin
--        servicio a los demas clientes de la misma empresa. El limite de la
--        app (10/min por org, docs/eng/03 seccion 7) sigue siendo el de la
--        experiencia normal; este es otra cosa.
--      - 30/hora es deliberadamente holgado: el uso legitimo mas intenso que
--        imaginamos es un cliente que se equivoca de key y la reemplaza varias
--        veces seguidas (alta + revocacion + alta ~ 6-8 acciones). 30 deja
--        ~4x de margen sobre ese peor caso legitimo, y la ventana deslizante
--        devuelve cupo sola: no hay lockout ni estado que limpiar.
--      - Y sigue acotando el dano: el peor caso de un cliente hostil pasa de
--        "infinitas filas" a <= 720 filas/dia en audit_log, un volumen que el
--        operador ve venir (audit_log es legible para el) y que no compromete
--        la base.
--
--    QUE CUENTA: solo acciones EXITOSAS, porque una llamada que falla no
--    inserta en audit_log (la excepcion aborta la transaccion completa). Es lo
--    correcto para este hallazgo, que es sobre CRECIMIENTO de tablas: una
--    llamada que no escribe no hace crecer nada.
--
--    POR CLIENTE VIA usuarios: audit_log no tiene cliente_id, tiene actor_id
--    (-> public.usuarios). Se cuentan las acciones de TODOS los usuarios de
--    ese cliente, no solo del que llama: contando por actor_id suelto, un
--    cliente con varios usuarios multiplicaria su cupo.
--
--    EL LOCK NO ES DECORATIVO: sin el, el limite se evade mandando N llamadas
--    en paralelo — todas leen el contador antes de que cualquiera haya hecho
--    commit, todas ven 0 y todas insertan (READ COMMITTED). El advisory lock
--    por cliente serializa lectura-decision-escritura. Es xact: se suelta solo
--    al terminar la transaccion. Un cliente solo puede hacerse esperar a si
--    mismo (la clave incluye su cliente_id), nunca a otro tenant.
--
--    SECURITY DEFINER porque debe leer audit_log y usuarios sin depender de la
--    RLS del que llama. No se le concede EXECUTE a nadie: solo la usan las dos
--    RPC, que ya corren como el dueno.
-- ---------------------------------------------------------------------------
create or replace function app.exigir_cupo_api_keys(p_org uuid, p_cliente uuid)
returns void
language plpgsql security definer set search_path = '' as $fn$
declare
  c_ventana constant interval := interval '1 hour';
  c_max     constant integer  := 30;
  v_usados  integer;
begin
  -- Sin tenant no hay nada que contar. El llamador ya valido la sesion antes
  -- de llegar aca; esto es solo para que el guardia nunca sea el que explota.
  if p_org is null or p_cliente is null then
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('kaudal.api_key.' || p_cliente::text, 0)
  );

  select pg_catalog.count(*)
    into v_usados
  from public.audit_log a
  where a.org_id = p_org
    and a.accion like 'api_key.%'
    and a.created_at >= pg_catalog.now() - c_ventana
    and a.actor_id in (
      select u.id
      from public.usuarios u
      where u.org_id = p_org
        and u.cliente_id = p_cliente
    );

  if v_usados >= c_max then
    -- errcode PT429: no colisiona con los que ya usan estas funciones (42501,
    -- 22023, 23505) y PostgREST 16 traduce la clase PT a HTTP tal cual, asi
    -- que quien llama el RPC directo recibe el mismo 429 que da la app. El
    -- mensaje es el que ve el usuario final: humano, en espanol, y sin
    -- revelar el tope exacto.
    raise exception 'Demasiados intentos. Espera un poco antes de volver a intentarlo.'
      using errcode = 'PT429',
            hint    = 'Vuelve a intentarlo en unos minutos.';
  end if;
end
$fn$;

comment on function app.exigir_cupo_api_keys(uuid, uuid) is
  'Backstop de abuso DENTRO de la BD para los RPC de API keys (hallazgo MEDIO-1 de 5.1): lanza PT429 si ese cliente ya hizo 30 acciones api_key.* en la ultima hora. Cuenta sobre audit_log (fuente de verdad ya existente), por cliente y no por org, y serializa con advisory lock para que N llamadas en paralelo no se salten el conteo.';

revoke all on function app.exigir_cupo_api_keys(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. guardar_api_key_cliente: identica a 20260826220500 salvo la llamada al
--    guardia (marcada con >>> NUEVO). Se reproduce entera porque plpgsql no
--    admite parches parciales.
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

  -- >>> NUEVO (20260827093000): tope de abuso. Va aqui, despues de la guarda
  -- de rol y ANTES de validar el payload o tocar una sola fila: al operador
  -- (que ni siquiera llega hasta aca) no lo afecta, y al que ya excedio el
  -- cupo se le corta antes de gastar trabajo.
  perform app.exigir_cupo_api_keys(v_org, v_cliente);

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
    -- FILA COMPLETA (ciphertext + iv + auth_tag incluidos). PostgREST devuelve
    -- ese detail al navegador y ademas queda en los logs de Postgres.
    -- docs/eng/03 principio 3: ese material NUNCA aparece en un mensaje de
    -- error. Se atrapa y se responde generico. Hoy el unico CHECK alcanzable
    -- desde aca es el de `proveedor` (el resto se valida antes); la lista
    -- permitida sigue viviendo solo en la tabla.
    when check_violation or not_null_violation then
      raise exception 'No pudimos guardar la API key. Revisa el proveedor e intentalo de nuevo.'
        using errcode = '22023';
  end;

  -- Auditoria (CLAUDE.md regla 5). Solo metadatos: jamas ciphertext, iv, tag
  -- ni la key en claro (que esta funcion nunca recibe).
  -- Ademas es lo que cuenta app.exigir_cupo_api_keys: si algun dia se agrega
  -- otra accion 'api_key.*', entra al mismo cupo automaticamente.
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
  'Unica via por la que un cliente da de alta o rota su API key. Recibe SOLO bytes ya cifrados por el backend (nunca la key en claro), toma org_id/cliente_id de la sesion, revoca la key activa anterior del mismo proveedor+alias encadenandola con rotada_de, y devuelve solo metadatos (jamas ciphertext/iv/auth_tag). Topada en 30 acciones api_key.* por cliente/hora por app.exigir_cupo_api_keys, aunque se la llame directo por PostgREST.';

-- ---------------------------------------------------------------------------
-- 4. revocar_api_key_cliente: identica a 20260826220500 salvo la llamada al
--    guardia.
--
--    Tambien se limita, aunque revocar no cree keys: cada revocacion efectiva
--    escribe su fila en audit_log, que es el recurso que este hallazgo
--    protege. Revocar dos veces la misma key sigue siendo idempotente y la
--    segunda vez no consume cupo (no escribe auditoria).
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

  -- >>> NUEVO (20260827093000): mismo cupo compartido con la alta/rotacion.
  perform app.exigir_cupo_api_keys(v_org, v_cliente);

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
  'El cliente revoca (estado = revocada) una API key SUYA. Baja logica: no borra la fila para no romper agentes ni la cadena de rotacion. Si la key no existe o es de otro cliente, error generico identico. Comparte el cupo de 30 acciones api_key.* por cliente/hora de app.exigir_cupo_api_keys.';

-- ---------------------------------------------------------------------------
-- 5. Privilegios
--    `create or replace` conserva los grants existentes, pero se repiten para
--    que esta migracion deje el estado final escrito en un solo lugar. Sigue
--    sin haber ningun privilegio de authenticated sobre api_keys_cifradas.
-- ---------------------------------------------------------------------------
revoke all on function public.guardar_api_key_cliente(text, bytea, bytea, bytea, integer, text, text, text) from public, anon;
revoke all on function public.revocar_api_key_cliente(uuid) from public, anon;

grant execute on function public.guardar_api_key_cliente(text, bytea, bytea, bytea, integer, text, text, text) to authenticated, service_role;
grant execute on function public.revocar_api_key_cliente(uuid) to authenticated, service_role;
