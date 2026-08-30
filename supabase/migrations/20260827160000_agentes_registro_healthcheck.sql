-- ============================================================================
-- Kaudal · Registro de agente que ya corre: canal, estado `caido`,
--          healthcheck y secreto de auth del endpoint (Tareas 6.1 y 6.2)
--
-- Fuentes: docs/eng/01-arquitectura.md seccion 4 (4.1 datos por agente, 4.2
--          healthcheck, 4.3 endpoints); docs/eng/05-frontend-operador.md
--          seccion 9 (filtro por estado Activo/Pausado/Error), seccion 10 paso
--          2 ("Header/secreto de auth ... se guarda cifrado") y seccion 11
--          ("auth enmascarada").
--
-- NOTA sobre el spec: docs/eng/01 4.1 describe un `org_id` por cliente final y
-- una API NestJS. El esquema real de Kaudal (20260826125600) ya resolvio eso de
-- otra forma: UN operador con org_id propio y muchos `clientes` colgando. Esta
-- migracion NO reabre esa decision: mapea los campos del spec sobre el modelo
-- vigente (`agentes.cliente_id` cumple el rol de "dueno" que el doc llama
-- org_id; el aislamiento de tenant sigue siendo org_id + cliente_id).
--
-- QUE AGREGA
--   1. `canal`      -> por donde conversa el agente con el usuario final.
--   2. estado       -> se suma 'caido' a la lista permitida (4.1 / 9).
--   3. healthcheck  -> health_url, ultimo_healthcheck_en, ultimo_healthcheck_ok,
--                      healthcheck_fallos_consecutivos (regla "falla N veces
--                      seguidas" de 4.2).
--   4. auth del endpoint -> auth_tipo + material cifrado (ciphertext/iv/tag/
--                      version) + auth_header_nombre, con CHECK de consistencia.
--   5. Indices para la lista del operador y para el barrido de healthcheck.
--   6. Vista public.agentes_publicos + grants por columna: el material cifrado
--      deja de ser legible por `authenticated`.
--
-- LO QUE NO HACE
--   No cifra. Igual que con api_keys_cifradas (docs/eng/03 2.3), el cifrado
--   AES-256-GCM ocurre en el backend con la clave maestra fuera de la BD; aca
--   solo se persisten bytes opacos.
--   No toca las politicas RLS de `agentes`: ver seccion 6.
--
-- Rollback: supabase/rollbacks/20260827160000_agentes_registro_healthcheck_down.sql
-- Reversible: solo agrega columnas nullable (o con default), constraints,
-- indices y una vista. No borra ni reescribe ninguna fila existente.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. canal: por donde habla el agente con el usuario final
--
--    Es OTRA cosa que `tipo`: `tipo` es el runtime donde corre el agente
--    (mastra | n8n | custom); `canal` es la superficie por la que le llega la
--    conversacion. Un agente Mastra puede atender por WhatsApp y otro por web.
--
--    NULLABLE a proposito: al registrar un agente que ya corre, el operador
--    puede no saber todavia por donde entra el trafico (el wizard de
--    docs/eng/05 seccion 10 ni siquiera lo pregunta hoy). Obligarlo forzaria un
--    valor inventado, que es peor que un NULL honesto.
--
--    CHECK cerrado con escape hatch: se acota a la lista de abajo en vez de
--    dejarlo texto libre porque la pantalla /agentes va a filtrar por canal y
--    un texto libre degenera en 'whatsapp' / 'WhatsApp' / 'wsp' y rompe el
--    filtro. 'otro' es la valvula: cualquier canal no previsto entra ahi sin
--    migracion, y si alguno se vuelve frecuente se le agrega su valor. Mismo
--    patron que todos los enums del esquema (CHECK sobre text, no tipo enum de
--    Postgres: agregar un valor es un ALTER de constraint reversible).
-- ---------------------------------------------------------------------------
alter table public.agentes
  add column canal text
    constraint chk_agentes_canal
    check (canal is null or canal in ('whatsapp','web','api','otro'));

comment on column public.agentes.canal is
  'Por donde conversa el agente con el usuario final (whatsapp | web | api | otro). Distinto de `tipo`, que es el runtime donde corre. NULL = todavia no declarado. WhatsApp es el canal principal en Chile.';

-- ---------------------------------------------------------------------------
-- 2. estado: se suma 'caido'
--
--    docs/eng/01 4.1 define estado = activo | caido | pausado y 4.2 la
--    transicion: si el healthcheck falla N veces seguidas, el agente pasa a
--    `caido`. docs/eng/05 seccion 9 lo pinta como "Error (danger)".
--
--    'archivado' se conserva: es el "dado de baja" del operador y NO es lo
--    mismo que 'caido' (voluntario vs. sintoma). Su semantica sigue pareada con
--    deleted_at, que no se toca: no se duplica el borrado logico.
--
--    Sin riesgo de datos: la lista solo se AMPLIA, ninguna fila existente puede
--    violar el CHECK nuevo, asi que la validacion inmediata no puede fallar.
-- ---------------------------------------------------------------------------
alter table public.agentes drop constraint agentes_estado_check;
alter table public.agentes
  add constraint agentes_estado_check
  check (estado in ('activo','pausado','caido','archivado'));

comment on column public.agentes.estado is
  'activo = responde | pausado = apagado a proposito por el operador | caido = registrado pero el healthcheck falla (docs/eng/01 4.2) | archivado = dado de baja (pareado con deleted_at).';

-- ---------------------------------------------------------------------------
-- 3. Healthcheck (docs/eng/01 4.2)
--
--    health_url NULLABLE: si no se declara, el healthcheck pega contra
--    endpoint_url. Esa es la regla, y queda documentada aca para que el backend
--    no invente otra: coalesce(health_url, endpoint_url).
--    Mismo CHECK de https que endpoint_url: un healthcheck por http filtraria
--    el secreto de auth del agente en claro por la red.
--
--    healthcheck_fallos_consecutivos NO estaba pedido, pero 4.2 exige "si falla
--    N veces seguidas -> caido" y sin contador persistido esa regla no se puede
--    implementar (el job no tiene estado propio y puede correr en varias
--    instancias). Nace en 0 y el backend lo resetea a 0 en cada exito.
--
--    chk_agentes_healthcheck: fecha y resultado van juntos o no van. Evita el
--    "hay un ok = true pero no se cuando", que hace indistinguible un chequeo
--    fresco de uno de hace tres dias.
-- ---------------------------------------------------------------------------
alter table public.agentes
  add column health_url text
    constraint chk_agentes_health_url
    check (health_url is null or health_url ~* '^https://'),
  add column ultimo_healthcheck_en timestamptz,
  add column ultimo_healthcheck_ok boolean,
  add column healthcheck_fallos_consecutivos integer not null default 0
    constraint chk_agentes_healthcheck_fallos
    check (healthcheck_fallos_consecutivos >= 0),
  add constraint chk_agentes_healthcheck
    check ((ultimo_healthcheck_en is null) = (ultimo_healthcheck_ok is null));

comment on column public.agentes.health_url is
  'GET que debe responder 200 (docs/eng/01 4.2). Si es NULL, el healthcheck usa endpoint_url. Exige https igual que endpoint_url.';
comment on column public.agentes.ultimo_healthcheck_en is
  'Cuando se corrio el ultimo healthcheck. Va siempre pareado con ultimo_healthcheck_ok.';
comment on column public.agentes.ultimo_healthcheck_ok is
  'Resultado del ultimo healthcheck. NULL = nunca se ha chequeado (que no es lo mismo que false).';
comment on column public.agentes.healthcheck_fallos_consecutivos is
  'Fallos seguidos desde el ultimo exito. Sostiene la regla "falla N veces -> estado = caido" de docs/eng/01 4.2. Se resetea a 0 en cada healthcheck exitoso.';

-- ---------------------------------------------------------------------------
-- 4. Auth del endpoint del agente (docs/eng/05 seccion 10 paso 2)
--
--    Para invocar al agente (o chequear su salud) Kaudal puede necesitar
--    presentar un secreto: un bearer token o un header tipo `X-API-Key: ...`.
--    Ese secreto es de la MISMA clase que la API key del cliente y recibe
--    exactamente el mismo tratamiento (docs/eng/01 6, docs/eng/03 2.3):
--    cifrado AES-256-GCM en el backend, nunca en texto plano, nunca al
--    frontend, descifrado solo en runtime.
--
--    Vive en columnas de la propia tabla `agentes` y no en api_keys_cifradas
--    porque esa tabla modela otra cosa: la key del CLIENTE contra el proveedor
--    de modelo, con su alias, su last4, su cadena de rotacion y su RPC de
--    cliente. Este otro secreto es del OPERADOR contra el endpoint del agente,
--    tiene ciclo de vida 1:1 con el agente y muere con el.
--
--    auth_version replica api_keys_cifradas.key_version: dice con que clave
--    maestra se cifro ESTA fila, para poder rotar la clave maestra sin
--    re-cifrar todo de golpe (docs/eng/03 2.4). Es nullable aca (y no
--    `not null default 1`) porque con auth_tipo = 'none' no hay nada cifrado
--    que versionar.
--
--    chk_agentes_auth es el corazon de esto: prohibe el estado a medias
--    (auth_tipo = 'bearer' sin ciphertext = agente que nunca va a poder
--    autenticarse; auth_tipo = 'none' con ciphertext = secreto huerfano que
--    nadie va a rotar ni borrar). CASE ... ELSE false: si alguien amplia
--    chk_agentes_auth_tipo y olvida este CHECK, falla cerrado.
--
--    chk_agentes_auth_header_nombre no es cosmetico: ese valor lo concatena el
--    backend dentro de una cabecera HTTP saliente. Acotado a [A-Za-z0-9_-]
--    (cubre Authorization, X-API-Key, X-Kaudal-Token...), un operador con la
--    sesion tomada no puede meter CR/LF ni ':' para colgar cabeceras extra en
--    las llamadas que Kaudal hace en su nombre.
-- ---------------------------------------------------------------------------
alter table public.agentes
  add column auth_tipo text not null default 'none'
    constraint chk_agentes_auth_tipo
    check (auth_tipo in ('none','bearer','header_key')),
  add column auth_ciphertext bytea
    constraint chk_agentes_auth_ciphertext
    check (auth_ciphertext is null or length(auth_ciphertext) > 0),
  add column auth_iv bytea
    constraint chk_agentes_auth_iv
    check (auth_iv is null or length(auth_iv) > 0),
  add column auth_tag bytea
    constraint chk_agentes_auth_tag
    check (auth_tag is null or length(auth_tag) > 0),
  add column auth_version integer
    constraint chk_agentes_auth_version
    check (auth_version is null or auth_version >= 1),
  add column auth_header_nombre text
    constraint chk_agentes_auth_header_nombre
    check (auth_header_nombre is null
           or (length(auth_header_nombre) between 1 and 64
               and auth_header_nombre !~ '[^A-Za-z0-9_-]')),
  add constraint chk_agentes_auth check (
    case auth_tipo
      when 'none' then
        auth_ciphertext is null and auth_iv is null and auth_tag is null
        and auth_version is null and auth_header_nombre is null
      when 'bearer' then
        auth_ciphertext is not null and auth_iv is not null
        and auth_tag is not null and auth_version is not null
        and auth_header_nombre is null
      when 'header_key' then
        auth_ciphertext is not null and auth_iv is not null
        and auth_tag is not null and auth_version is not null
        and auth_header_nombre is not null
      else false
    end
  );

comment on column public.agentes.auth_tipo is
  'Como se autentica Kaudal contra el endpoint del agente: none | bearer (Authorization: Bearer <secreto>) | header_key (<auth_header_nombre>: <secreto>). chk_agentes_auth obliga a que el material cifrado este completo o ausente, nunca a medias.';
comment on column public.agentes.auth_ciphertext is
  'SEGURIDAD CRITICA: secreto de auth del endpoint, cifrado AES-256-GCM por el backend. Jamas se expone al frontend: no esta en agentes_publicos ni en los GRANT de authenticated. Solo service_role lo lee.';
comment on column public.agentes.auth_iv is
  'Jamas se expone al frontend.';
comment on column public.agentes.auth_tag is
  'Jamas se expone al frontend.';
comment on column public.agentes.auth_version is
  'Version de la clave maestra que cifro auth_ciphertext (mismo rol que api_keys_cifradas.key_version, docs/eng/03 2.4). Versiona la clave, no el algoritmo.';
comment on column public.agentes.auth_header_nombre is
  'Nombre del header cuando auth_tipo = header_key (ej. X-API-Key). El VALOR va cifrado en auth_ciphertext. Acotado a [A-Za-z0-9_-] para que no se puedan inyectar cabeceras.';

-- ---------------------------------------------------------------------------
-- 5. Indices
--
--    5.1 La tabla de docs/eng/05 seccion 9 lista TODOS los agentes de la org
--        filtrando por estado. idx_agentes_org(org_id) no alcanza: no distingue
--        estado ni excluye los borrados logicos. Mismo patron que
--        idx_clientes_org_estado.
--
--    5.2 El barrido periodico del healthcheck (4.2, cada ~60 s) pregunta
--        "cuales toca chequear ahora": ordena por ultimo_healthcheck_en
--        ascendente con los nunca chequeados primero. Parcial porque un agente
--        pausado o archivado no se chequea y no tiene por que ocupar espacio.
--
--    NO se indexa `canal`: hoy no hay consulta que filtre solo por canal y
--    dentro de una org la cardinalidad es baja (4 valores) -> el indice no
--    pagaria su costo de escritura. Si /agentes termina filtrando por canal, el
--    indice correcto sera compuesto (org_id, canal), no canal solo.
-- ---------------------------------------------------------------------------
create index idx_agentes_org_estado
  on public.agentes (org_id, estado)
  where deleted_at is null;

create index idx_agentes_healthcheck_pendiente
  on public.agentes (ultimo_healthcheck_en asc nulls first)
  where deleted_at is null and estado in ('activo','caido');

comment on index public.idx_agentes_org_estado is
  'Sostiene la tabla /agentes del operador (docs/eng/05 seccion 9): agentes de la org filtrados por estado, sin los borrados logicos.';
comment on index public.idx_agentes_healthcheck_pendiente is
  'Sostiene el barrido periodico de healthcheck (docs/eng/01 4.2): los agentes chequeables ordenados por antiguedad del ultimo chequeo, con los nunca chequeados primero.';

-- ---------------------------------------------------------------------------
-- 6. RLS: revision explicita (no cambia nada)
--
--    Politicas vigentes sobre public.agentes:
--      agentes_operador  FOR ALL    -> org_id = app.current_org_id()
--                                      and app.current_rol() = 'operador'
--      agentes_cliente   FOR SELECT -> org_id = app.current_org_id()
--                                      and cliente_id = app.current_cliente_id()
--
--    VEREDICTO: siguen correctas tal cual, no se tocan. Ambas filtran por
--    org_id (y la del cliente ademas por cliente_id) y ninguna columna agregada
--    aca participa del scope de tenant: canal, healthcheck y auth_* son
--    atributos de la fila, no llaves de aislamiento. Una columna nueva no puede
--    ampliar el conjunto de FILAS visibles. RLS + FORCE siguen activos.
--
--    PERO: RLS filtra filas, NO columnas. La fila del agente SI es visible para
--    el cliente dueno (y entera para el operador), asi que sin la seccion 7 el
--    material cifrado de auth quedaria legible por cualquier `authenticated`
--    con un `select *` via PostgREST. Eso se cierra abajo con privilegios por
--    columna, que es la herramienta correcta para este problema (el mismo
--    razonamiento que en 20260826141500 llevo a resolver el perfil propio con
--    un RPC y no con una policy: "RLS no restringe columnas").
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 7. Privilegios por columna + vista publica
--
--    DECISION: SI a la vista agentes_publicos, pero como segunda capa. Ninguna
--    de las dos sobra:
--
--    (a) GRANT por columna sobre la tabla base. Es la unica capa que un cliente
--        no puede saltarse: aunque llame PostgREST a mano pidiendo
--        ?select=auth_ciphertext, Postgres responde permission denied. La vista
--        sola no protegeria nada mientras la tabla base siguiera legible entera
--        (confiar en que "la app nunca hace select *" no es un control, es una
--        esperanza).
--        Efecto colateral DESEADO: `select *` sobre public.agentes ahora FALLA
--        para authenticated. Falla cerrada y ruidosa, en linea con la decision
--        de 20260826163000 (nada nace con permisos regalados).
--
--    (b) La vista, para que ese `select *` que ahora falla tenga un destino
--        obvio y seguro. Sin ella la unica salida seria enumerar columnas a
--        mano en cada consulta, y la primera vez que alguien agregue una
--        columna sensible se le va a olvidar excluirla.
--        security_invoker = true: la vista NO elude la RLS de agentes, la
--        hereda del que consulta -> el operador ve los de su org y el cliente
--        solo los suyos, sin duplicar el filtro de tenant dentro de la vista (a
--        diferencia de api_keys_publicas, que SI lo lleva dentro porque su
--        tabla base no es legible para nadie).
--        No filtra deleted_at: el operador necesita ver los archivados.
--
--    Tambien sale de los GRANT `ingest_token_hash`, que hasta hoy era legible
--    por authenticated: es el hash del token con el que el agente reporta uso
--    (docs/eng/01 5.2). No cruza tenants, pero es material de autenticacion
--    regalado a un atacante offline y el frontend no lo necesita nunca.
--
--    NO se restringen INSERT/UPDATE: el operador registra y edita agentes desde
--    su panel (docs/eng/01 4.3, POST/PATCH) y el cifrado ocurre en el Route
--    Handler antes de escribir, asi que la fila ya cifrada llega por la sesion
--    del operador. Escribir bytes opacos en tu propia org no filtra nada. Si
--    algun dia se quiere cerrar tambien la escritura, el camino es un RPC
--    security definer (patron de guardar_api_key_cliente), no un GRANT mas fino.
-- ---------------------------------------------------------------------------
revoke select on public.agentes from authenticated;

grant select (
  id, org_id, cliente_id, nombre, descripcion, tipo, canal,
  endpoint_url, health_url, metodo_reporte, modelo_default, api_key_id,
  auth_tipo, auth_header_nombre,
  estado, ultimo_healthcheck_en, ultimo_healthcheck_ok,
  healthcheck_fallos_consecutivos,
  deleted_at, created_at, updated_at
) on public.agentes to authenticated;

create view public.agentes_publicos
  with (security_invoker = true, security_barrier = true) as
  select a.id, a.org_id, a.cliente_id, a.nombre, a.descripcion, a.tipo, a.canal,
         a.endpoint_url, a.health_url, a.metodo_reporte, a.modelo_default,
         a.api_key_id, a.auth_tipo, a.auth_header_nombre, a.estado,
         a.ultimo_healthcheck_en, a.ultimo_healthcheck_ok,
         a.healthcheck_fallos_consecutivos,
         a.deleted_at, a.created_at, a.updated_at
  from public.agentes a;

comment on view public.agentes_publicos is
  'Lectura segura de public.agentes para el frontend: las mismas filas que deja ver la RLS del que consulta (security_invoker), sin ingest_token_hash ni auth_ciphertext/auth_iv/auth_tag/auth_version. Usar esta vista para leer; la tabla base ya no admite select * para authenticated.';

-- Los default privileges de public estan apagados desde 20260826163000: esta
-- vista nace sin permisos y hay que concederlos a mano.
revoke all on public.agentes_publicos from anon, authenticated;
grant select on public.agentes_publicos to authenticated;
grant all    on public.agentes_publicos to service_role;
