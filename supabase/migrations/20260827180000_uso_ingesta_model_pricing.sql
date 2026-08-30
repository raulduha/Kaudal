-- ============================================================================
-- Kaudal · Ingesta de uso: idempotencia + status, y tarifas por modelo
--          (Tarea 7.1)
--
-- Fuentes: docs/eng/07-uso-y-cobros.md 2.2 (campos del evento), 2.3 (reglas de
--          ingest e Idempotency-Key), 3.1-3.2 (formula de costo y model_pricing),
--          8 (idempotencia en tres puntos); docs/eng/01-arquitectura.md 5.1-5.2
--          (endpoint de ingesta, aislamiento por ingest_token, congelado del
--          costo estimado); tools/calculadora-agentes.html (precios semilla).
--
-- NOTA sobre el spec: docs/eng/07 2.2 describe una tabla NUEVA `usage_events`
-- (en ingles, con endpoint_id, sobre NestJS). Esta migracion NO la crea: el
-- esquema real de Kaudal ya resolvio ese modelo en `public.registros_uso`
-- (20260826125600 3.6), con los mismos campos en espanol. Crear `usage_events`
-- al lado seria partir la verdad del uso en dos tablas. Mapeo campo a campo:
--   spec                     -> real
--   org_id                   -> org_id (+ cliente_id, que es el tenant fino)
--   agent_id                 -> agente_id
--   occurred_at              -> ocurrido_en
--   received_at              -> created_at   (ya existia; no se agrega nada)
--   source                   -> origen       (ver "gap conocido" abajo)
--   input/output_tokens      -> tokens_in / tokens_out
--   units                    -> unidades
--   estimated_cost_clp       -> costo_estimado + moneda
--   status                   -> status            (SE AGREGA aca)
--   idempotency_key          -> idempotency_key   (SE AGREGA aca)
--   endpoint_id              -> no existe: Kaudal no modela endpoints como
--                               entidad; el "por donde" vive en metadata.canal
--                               (docs/eng/07 4) y el ingest_token ya identifica
--                               al emisor. Por eso el unico de idempotencia va
--                               por agente_id y no por org_id (ver seccion 1).
--
-- GAP CONOCIDO (deliberado, fuera de alcance de 7.1)
--   docs/eng/07 2.1 distingue TRES modos de captura (reported /
--   estimated_event / estimated_aggregate) pero registros_uso.origen solo
--   admite dos ('estimado','reportado'). Ampliar esa lista es una decision de
--   producto (si a Kaudal le importa separar "estime por evento" de "estime por
--   conteo"), no una correccion tecnica, asi que no se toca aca.
--
-- QUE AGREGA
--   1. registros_uso.idempotency_key + unico parcial (agente_id, key).
--   2. registros_uso.status (ok | error | timeout).
--   3. Indice parcial para las ejecuciones que fallaron.
--   4. public.model_pricing: tarifas por modelo (catalogo GLOBAL del operador,
--      sin org_id), con historial por vigencia y una sola tarifa activa por
--      modelo. Semilla con los 5 modelos de tools/calculadora-agentes.html.
--
-- LO QUE NO HACE
--   No abre INSERT en registros_uso para `authenticated`: ver seccion 5.
--   No calcula el costo. La formula de docs/eng/07 3.1 se aplica en el backend
--   al momento del ingest y se CONGELA en costo_estimado; cambiar una tarifa
--   despues no reescribe historicos (docs/eng/07 3.2). Por eso no hay trigger
--   ni columna generada que recalcule.
--
-- Rollback: supabase/rollbacks/20260827180000_uso_ingesta_model_pricing_down.sql
-- Reversible: solo agrega columnas (nullable o con default seguro), indices y
-- una tabla nueva. No borra ni reescribe ninguna fila existente.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Idempotencia del ingest (docs/eng/07 2.3 y 8)
--
--    NULLABLE, a diferencia del spec, que la llama "obligatoria". Motivo: hay
--    agentes legacy (n8n sin instrumentar, el modo "estimado agregado" de
--    docs/eng/07 2.1) que hoy no mandan la cabecera. Hacerla NOT NULL
--    convertiria a Kaudal en el que PIERDE el evento de uso de esos agentes,
--    que es exactamente el dato que este modulo existe para no perder. La
--    obligatoriedad se exige en el borde HTTP (Zod), donde se puede condicionar
--    por agente segun metodo_reporte; la BD garantiza lo que si es invariante:
--    si viene, no se duplica.
--
--    SCOPE = (agente_id, idempotency_key), no (org_id, key) como pide el doc.
--    El doc asume un `endpoint_id` que aca no existe, y org_id en Kaudal es la
--    org del OPERADOR: un unico por org haria colisionar a dos agentes de dos
--    clientes distintos si ambos usan, digamos, el id de ejecucion "1" de su
--    propio runtime -> el segundo evento se perderia en silencio, que es peor
--    que duplicarlo. Con agente_id el scope coincide con el emisor real del
--    evento (el ingest_token resuelve a UN agente, docs/eng/01 5.2), que es la
--    unidad correcta de deduplicacion: mas estricto donde importa (el mismo
--    agente no se duplica) y mas laxo donde no aporta (entre agentes).
--
--    CHECK de formato: este valor llega en una cabecera HTTP
--    (`Idempotency-Key`) y termina en un WHERE. Acotarlo a caracteres de token
--    (cubre uuid, ULID, base64url, hashes) evita persistir cabeceras con
--    espacios o CR/LF y deja el dato apto para comparacion exacta sin
--    normalizacion ambigua. 255 es holgado para cualquier id de ejecucion.
-- ---------------------------------------------------------------------------
alter table public.registros_uso
  add column idempotency_key text
    constraint chk_uso_idempotency_key
    check (idempotency_key is null
           or idempotency_key ~ '^[A-Za-z0-9._:~+/=-]{1,255}$');

create unique index uq_uso_idempotencia
  on public.registros_uso (agente_id, idempotency_key)
  where idempotency_key is not null;

comment on column public.registros_uso.idempotency_key is
  'Cabecera Idempotency-Key del ingest (docs/eng/07 2.3). Unico por agente_id (no por org_id): el ingest_token resuelve a UN agente, que es la unidad real de deduplicacion. NULL = agente que no la reporta (permitido: perder el evento seria peor).';
comment on index public.uq_uso_idempotencia is
  'Hace que un reintento del agente no duplique el evento de uso. Parcial: los eventos sin idempotency_key no compiten entre si.';

-- ---------------------------------------------------------------------------
-- 2. status de la ejecucion (docs/eng/07 2.2)
--
--    NOT NULL DEFAULT 'ok': las filas existentes quedan en 'ok', que es la
--    lectura honesta del historico (hasta hoy solo se registraba uso consumado;
--    no habia forma de reportar un fallo). Sin reescritura de tabla: desde
--    PG 11 un DEFAULT no volatil se agrega sin reescribir las filas.
--
--    Es OTRA cosa que `origen`: `origen` dice de donde salio el NUMERO (lo
--    reporto el agente o lo estimo Kaudal); `status` dice como termino la
--    EJECUCION. Un evento puede ser origen='reportado' y status='timeout': el
--    agente gasto tokens y el usuario final no recibio nada. Ese caso es
--    justamente el que hay que poder ver.
--
--    Un evento con status <> 'ok' IGUAL suma costo: los tokens al proveedor ya
--    se gastaron aunque la ejecucion fallara. Por eso se marca, no se descuenta.
-- ---------------------------------------------------------------------------
alter table public.registros_uso
  add column status text not null default 'ok'
    constraint chk_uso_status check (status in ('ok','error','timeout'));

comment on column public.registros_uso.status is
  'Como termino la ejecucion: ok | error | timeout (docs/eng/07 2.2). Distinto de `origen`, que dice de donde salio la cifra de tokens. Un evento fallido igual suma costo: los tokens ya se gastaron.';

-- ---------------------------------------------------------------------------
-- 3. Indice de ejecuciones fallidas
--
--    idx_uso_org_fecha (org_id, ocurrido_en desc) ya sostiene las series de
--    /usage/by-day y /usage/summary. Lo que no sostiene es "que se esta
--    rompiendo": los fallos son una fraccion chica de las filas y buscarlos
--    obliga a leer el rango entero y descartar.
--    PARCIAL where status <> 'ok': ocupa proporcional a los fallos (casi nada
--    si el sistema esta sano) y solo se paga al escribir un evento fallido.
--
--    NO se indexa `metadata` (GIN) para /usage/where: esa vista es un GROUP BY
--    metadata->>'canal' sobre un rango de fechas de un tenant, y un GIN no
--    acelera agrupaciones, solo busquedas por contencion. El acceso correcto
--    ahi sigue siendo idx_uso_org_fecha. Si algun dia se FILTRA por canal (no
--    se agrupa), el indice correcto sera un BTREE de expresion sobre
--    (org_id, (metadata->>'canal'), ocurrido_en), no un GIN.
-- ---------------------------------------------------------------------------
create index idx_uso_org_fallos
  on public.registros_uso (org_id, ocurrido_en desc)
  where status <> 'ok';

comment on index public.idx_uso_org_fallos is
  'Ejecuciones fallidas por org y fecha, para alertas y el panel del operador. Parcial: no paga costo mientras los agentes respondan bien.';

-- ---------------------------------------------------------------------------
-- 4. public.model_pricing (docs/eng/07 3.2)
--
--    SIN org_id, A PROPOSITO. Es la tarifa publica de Anthropic/OpenAI mas el
--    tipo de cambio que fija Kaudal (el operador): es catalogo, no dato de un
--    cliente. Ponerle org_id obligaria a duplicar las mismas 5 filas por cada
--    cliente inscrito y a mantenerlas sincronizadas a mano. Es la excepcion
--    consciente a la regla "toda tabla lleva org_id" del CLAUDE.md, y el
--    criterio para futuras excepciones es el mismo: si el dato NO tiene dueno,
--    no hay nada que aislar.
--
--    HISTORIAL POR REEMPLAZO, no por UPDATE. `activo` + `vigente_desde` +
--    unico parcial (modelo) where activo => para cambiar una tarifa se
--    desactiva la vigente y se inserta una nueva. Mismo patron que la rotacion
--    de api_keys_cifradas (rotada_de). Asi un costo historico se puede
--    reconciliar contra la tarifa que REALMENTE regia el dia del ingest, que es
--    lo que exige docs/eng/07 3.2 al decir que cambiar la tarifa no reescribe
--    historicos. Un UPDATE in-place destruiria esa trazabilidad.
--
--    numeric(12,8) y no (10,6): a 6 decimales GPT-4o mini (0.00015 USD/1k) ya
--    consume 5 y no queda margen para modelos mas baratos que aparezcan
--    despues. 8 decimales cuesta lo mismo en Postgres y evita una migracion de
--    tipo mas adelante.
--
--    fx_usd_clp viaja CON la tarifa (docs/eng/07 3.1: "guardado con la tarifa
--    para trazabilidad") y no en una tabla de tipos de cambio aparte: la tarifa
--    en CLP solo tiene sentido como el par (precio USD, tipo de cambio usado).
--
--    modelo normalizado a minusculas: el cruce con registros_uso.modelo es por
--    texto exacto. Sin este CHECK, 'GPT-4o' y 'gpt-4o' serian dos tarifas
--    distintas y el estimador fallaria en silencio (costo 0) en vez de fuerte.
-- ---------------------------------------------------------------------------
create table public.model_pricing (
  id                uuid primary key default gen_random_uuid(),
  modelo            text not null
                    constraint chk_pricing_modelo
                    check (modelo = lower(btrim(modelo))
                           and length(modelo) between 1 and 128),
  proveedor         text not null
                    constraint chk_pricing_proveedor
                    check (proveedor in ('anthropic','openai','otro')),
  input_usd_por_1k  numeric(12,8) not null
                    constraint chk_pricing_input  check (input_usd_por_1k  >= 0),
  output_usd_por_1k numeric(12,8) not null
                    constraint chk_pricing_output check (output_usd_por_1k >= 0),
  fx_usd_clp        numeric(10,2) not null
                    constraint chk_pricing_fx     check (fx_usd_clp > 0),
  vigente_desde     date        not null default current_date,
  activo            boolean     not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.model_pricing is
  'Tarifas por modelo para estimar costo (docs/eng/07 3.2). Catalogo GLOBAL del operador: NO lleva org_id ni RLS de tenant porque no es dato de ningun cliente. Para cambiar una tarifa se desactiva la vigente y se inserta otra (nunca UPDATE in-place), asi queda historial reconciliable.';
comment on column public.model_pricing.modelo is
  'Identificador de API del modelo, en minusculas (ej. gpt-4o, claude-sonnet-4-5). Debe calzar exacto con registros_uso.modelo; el CHECK de minusculas evita tarifas duplicadas por diferencia de mayusculas.';
comment on column public.model_pricing.fx_usd_clp is
  'Tipo de cambio USD->CLP congelado junto a esta tarifa (docs/eng/07 3.1). Vive aca y no en una tabla aparte porque la tarifa en CLP solo es interpretable junto al fx con que se calculo.';
comment on column public.model_pricing.vigente_desde is
  'Desde cuando rige. Con `activo` forma el historial: las filas viejas quedan activo=false y siguen consultables para auditar un costo del pasado.';
comment on column public.model_pricing.activo is
  'Solo UNA fila activa por modelo (uq_model_pricing_activo). Desactivar + insertar es la forma soportada de cambiar precio.';

-- Una sola tarifa vigente por modelo. El historico (activo = false) no compite.
create unique index uq_model_pricing_activo
  on public.model_pricing (modelo) where activo;

-- Reconstruir "que tarifa regia para este modelo en tal fecha" (auditoria).
create index idx_model_pricing_historial
  on public.model_pricing (modelo, vigente_desde desc);

comment on index public.uq_model_pricing_activo is
  'Garantiza que el estimador nunca encuentre dos tarifas vigentes para el mismo modelo (lo que lo dejaria eligiendo al azar).';
comment on index public.idx_model_pricing_historial is
  'Sostiene la auditoria de un costo congelado: que tarifa regia para un modelo en una fecha dada.';

create trigger trg_model_pricing_updated
  before update on public.model_pricing
  for each row execute function app.set_updated_at();

-- 4.1 RLS
--     Se habilita RLS igual que en el resto del esquema (nada en `public` sin
--     RLS), pero la politica NO filtra tenant porque no hay tenant que filtrar:
--     los precios de lista de Anthropic/OpenAI son publicos y el portal del
--     cliente necesita poder mostrar con que tarifa se estimo su costo.
--
--     SIN `force row level security`, a diferencia de las tablas de cliente.
--     FORCE somete tambien al dueno (postgres) a las politicas y, como la unica
--     politica aqui es de SELECT, romperia el seed de esta misma migracion y
--     cualquier migracion futura que corrija una tarifa.
--
--     SIN politicas de INSERT/UPDATE/DELETE: hoy solo escriben service_role
--     (que bypassa RLS) y las migraciones. La pantalla de editar tarifas es la
--     tarea 7.2; cuando exista, la politica de escritura del operador se agrega
--     ahi, acotada a app.current_rol() = 'operador'.
alter table public.model_pricing enable row level security;

create policy model_pricing_lectura on public.model_pricing
  for select to authenticated
  using (true);

comment on policy model_pricing_lectura on public.model_pricing is
  'Catalogo global de lectura: sin filtro de tenant porque la tabla no tiene dueno. Es la unica politica sin org_id del esquema y la excepcion es deliberada (ver comentario de la tabla).';

-- 4.2 Privilegios
--     Los default privileges de `public` estan apagados desde 20260826163000:
--     esta tabla nace SIN permisos y hay que concederlos explicitamente.
revoke all on public.model_pricing from anon, authenticated;
grant select on public.model_pricing to authenticated;
grant all    on public.model_pricing to service_role;

-- 4.3 Semilla: los 5 modelos de tools/calculadora-agentes.html
--
--     La calculadora tenia estos precios hardcodeados en un array JS (USD por
--     1M tokens); aqui pasan a ser la fuente de verdad, convertidos a USD por
--     1k (dividir por 1000). El 6o item de la calculadora ("Personalizado") no
--     se siembra: no es un modelo, es la opcion de escribir precios a mano.
--
--     Los nombres son identificadores de API reales, no las etiquetas de la
--     calculadora ("Claude Sonnet (equilibrado)"): la etiqueta bonita es cosa
--     de la UI y lo que llega en registros_uso.modelo es el id de API. Cada id
--     se eligio para que CALCE con su precio: se prefirio el modelo cuya tarifa
--     de lista es exactamente la sembrada antes que el mas nuevo de la familia
--     con otro precio. Sembrar 'claude-haiku-4-5' a 0.80/4.00 habria dejado una
--     tarifa falsa en la tabla que decide la plata.
--
--     fx_usd_clp = 950 en las 5 filas: es el default de la calculadora.
--     REVISAR antes de produccion: es un valor de referencia, no el dolar del
--     dia. Idem los precios; ambos se corrigen desactivando la fila e
--     insertando otra (nunca con UPDATE).
--
--     vigente_desde explicita (no current_date) para que reaplicar la migracion
--     en otra fecha produzca exactamente el mismo estado.
--     ON CONFLICT sobre el unico parcial: re-ejecutable sin reventar y sin
--     pisar una tarifa que el operador ya haya corregido.
insert into public.model_pricing
  (modelo, proveedor, input_usd_por_1k, output_usd_por_1k, fx_usd_clp, vigente_desde, activo)
values
  ('claude-3-5-haiku-latest', 'anthropic', 0.00080000, 0.00400000, 950, date '2026-08-27', true),
  ('claude-sonnet-4-5',       'anthropic', 0.00300000, 0.01500000, 950, date '2026-08-27', true),
  ('claude-opus-4-1',         'anthropic', 0.01500000, 0.07500000, 950, date '2026-08-27', true),
  ('gpt-4o-mini',             'openai',    0.00015000, 0.00060000, 950, date '2026-08-27', true),
  ('gpt-4o',                  'openai',    0.00250000, 0.01000000, 950, date '2026-08-27', true)
on conflict (modelo) where activo do nothing;

-- ---------------------------------------------------------------------------
-- 5. Privilegios de registros_uso: revision explicita (NO cambia nada)
--
--    Estado verificado en la base antes de esta migracion:
--      authenticated -> SELECT   (solo lectura)
--      service_role  -> ALL
--    Las dos columnas nuevas quedan cubiertas por el GRANT de tabla que ya
--    existia; ninguna es sensible. idempotency_key es un id de ejecucion que
--    genera el propio agente, no material de autenticacion (ese es
--    agentes.ingest_token_hash, que ya salio de los GRANT en 20260827160000).
--
--    NO se agrega politica ni GRANT de INSERT para `authenticated`, y esa es la
--    decision de seguridad central de esta tarea:
--      - Quien llama a POST /usage/events es un AGENTE externo autenticado con
--        su ingest_token (docs/eng/01 5.1), no con una sesion de Supabase Auth.
--        En ese contexto no hay JWT, luego no hay auth.uid() ni
--        app.current_org_id(): cualquier politica de INSERT que escribieramos
--        evaluaria NULL y no protegeria nada. Escribe service_role.
--      - El aislamiento de ese camino lo da el backend: resuelve el
--        ingest_token a UN (org_id, cliente_id, agente_id) y lo escribe el.
--        Un token nunca puede registrar uso de otra org porque el org_id NO lo
--        elige el llamador, lo deriva el servidor del token. El body del
--        request no debe poder aportar org_id/cliente_id: si los trae, se
--        ignoran.
--      - Abrir INSERT a `authenticated` seria peor que inutil: un cliente
--        logueado podria inventar consumo propio (o de otro agente de su org) y
--        ensuciar la base del costo estimado.
--    La RLS de lectura (uso_cliente) sigue intacta y correcta: filtra por
--    org_id y ademas por cliente_id cuando el rol no es operador.
-- ---------------------------------------------------------------------------
