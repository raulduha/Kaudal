-- ============================================================================
-- Kaudal · Capa de datos de "Dudas y reclamos" (Fase 9, tareas 9.1 y 9.2)
-- Fuente: docs/eng/08-reclamos-y-soporte.md (§3 estados, §4 prioridad,
--         §7 adjuntos, §14 reglas de borde), CLAUDE.md regla 5 (todo auditable).
--
-- CONTEXTO
--   Las dos tablas del modulo (public.tickets_reclamos, public.mensajes_ticket)
--   existen desde la Fase 2 con su RLS ya auditada y probada. Esta migracion NO
--   las redefine: agrega lo que falta para que el cliente pueda adjuntar
--   archivos (9.1) y el operador tenga una bandeja kanban confiable (9.2).
--
-- ---------------------------------------------------------------------------
-- DECISION 1 · Se MANTIENE el vocabulario de estado/prioridad actual
-- ---------------------------------------------------------------------------
--   docs/eng/08 §3-§4 pide estados `nuevo/en_revision/resuelto/reabierto/
--   cerrado` y prioridades `baja/media/alta/urgente`. El esquema real usa
--   `abierto/en_proceso/respondido/cerrado` y `baja/normal/alta`. Se conserva
--   el vocabulario real y se mapea a copy en espanol en la UI:
--
--     doc            esquema real   copy sugerido en la bandeja
--     nuevo       -> abierto        "Nuevo"
--     reabierto   -> abierto        "Nuevo" (misma columna del kanban)
--     en_revision -> en_proceso     "En proceso"
--     resuelto    -> respondido     "Respondido"
--     cerrado     -> cerrado        "Cerrado"
--     urgente     -> alta           "Alta"
--     media       -> normal         "Normal"
--
--   Por que no reconciliar:
--     · `reabierto` existe en el doc solo para alimentar el SLA y el
--       auto-cierre a los 7 dias. Esta fase NO construye SLA en horario habil
--       CL ni cron de auto-cierre (deuda explicita, con precedente en 7.3 y
--       8.1). Sin esas dos cosas, `reabierto` seria una sexta columna del
--       kanban con exactamente el mismo comportamiento que `abierto`: mas
--       ruido para un operador solo, cero informacion nueva.
--     · `urgente` existe solo para el tramo de SLA de 2 horas habiles. Sin
--       calculo de SLA, `alta` ya es "esto primero" y la paleta de marca tiene
--       tres tonos de estado, no cuatro.
--     · El costo del cambio es real y el beneficio no: habria que reescribir
--       dos CHECK, migrar las filas existentes, reescribir
--       public.cambiar_estado_mi_ticket y tocar tests de RLS ya en verde.
--       Riesgo alto sobre superficie probada, a cambio de sinonimos.
--   Queda anotado como deuda: si algun dia se implementa SLA + auto-cierre,
--   reevaluar `reabierto` (necesita distinguir "nunca respondido" de "volvio").
--
-- ---------------------------------------------------------------------------
-- DECISION 2 · El operador NO recibe un RPC de cambio de estado
-- ---------------------------------------------------------------------------
--   docs/eng/08 §14 exige que "cada cambio de estado y prioridad quede
--   registrado (quien, cuando, de que a que)". La tentacion es un RPC
--   SECURITY DEFINER que audite, como en Fase 5. No sirve aca: la policy
--   `tickets_operador` es `for all` y seguira permitiendo el UPDATE directo
--   por PostgREST. Un RPC solo auditaria a quien decida usarlo — justo el
--   patron de "la app no es el unico control" que ya fallo en 5.1.
--   Por eso la auditoria va en un TRIGGER (seccion 5): audita el UPDATE
--   directo del operador, el RPC del cliente, el service_role del backend y
--   cualquier camino futuro, sin que nadie pueda olvidarse. Un RPC ademas
--   habria que mantenerlo en paralelo a la policy: dos fuentes de verdad.
--
-- ---------------------------------------------------------------------------
-- QUE AGREGA (resumen)
--   1. tickets_reclamos.prioridad_peso (columna generada) + indice del kanban.
--   2. ultimo_mensaje_en deja de ser una columna muerta: backfill, default,
--      NOT NULL y trigger que la mantiene con cada mensaje.
--   3. cerrado_en se mantiene sola (adios al CHECK que reventaba al arrastrar
--      una tarjeta a "Cerrado" sin setear la fecha a mano).
--   4. Maquina de estados de docs/eng/08 §3 aplicada al escribir un mensaje.
--   5. Auditoria automatica de alta / cambio de estado / cambio de prioridad.
--   6. RPC public.marcar_mensajes_leidos(uuid): unica via para las marcas de
--      leido (la tabla no tiene ni GRANT ni policy de UPDATE para nadie).
--   7. Tope de creacion de tickets DENTRO de la BD (docs/eng/08 §14).
--   8. Bucket privado `ticket-attachments` + politicas RLS sobre
--      storage.objects (docs/eng/08 §7).
--
-- Rollback: supabase/rollbacks/20260827200000_tickets_adjuntos_9_1_down.sql
-- Reversible. La unica escritura de filas es el backfill de ultimo_mensaje_en
-- (rellena NULLs, no pisa ningun valor existente) y la fila del bucket.
-- No borra nada, no cambia ningun tipo, no toca las policies ya auditadas de
-- mensajes_ticket ni de tickets_reclamos.
-- ============================================================================


-- ===========================================================================
-- 1. Orden del kanban: prioridad_peso
--
--    La bandeja de 9.2 ordena "por prioridad y despues por antiguedad". Con
--    `prioridad` en texto el orden alfabetico es alta < baja < normal: pone
--    las bajas antes que las normales. Cualquier `order by` que se escriba en
--    la app queda mal salvo que repita un CASE largo en cada consulta.
--
--    Columna GENERATED ... STORED y no una funcion:
--      · PostgREST puede ordenar por ella directo (?order=prioridad_peso.desc)
--        sin GRANT de EXECUTE sobre nada.
--      · Es indexable sin indice funcional y no se puede desincronizar de
--        `prioridad`: Postgres la recalcula en cada escritura.
--      · No se puede escribir a mano, asi que no hay forma de mentirle.
--    `else 0` cubre un valor futuro del CHECK que alguien agregue sin volver
--    aca: cae al fondo de la columna, nunca arriba de una prioridad alta.
--
--    Nota operativa: ADD COLUMN ... GENERATED ... STORED reescribe la tabla y
--    toma ACCESS EXCLUSIVE. A este volumen (decenas de filas) es instantaneo.
-- ===========================================================================
alter table public.tickets_reclamos
  add column prioridad_peso smallint
  generated always as (
    case prioridad
      when 'alta'   then 3
      when 'normal' then 2
      when 'baja'   then 1
      else 0
    end
  ) stored;

comment on column public.tickets_reclamos.prioridad_peso is
  'Derivada de `prioridad` (alta=3, normal=2, baja=1). Existe solo para ordenar: el orden alfabetico de `prioridad` pondria "baja" antes que "normal". No se escribe a mano.';

-- Indice de la bandeja: filtra por org + estado (una columna del kanban) y
-- entrega las filas ya ordenadas como las pinta la UI.
create index idx_tickets_kanban
  on public.tickets_reclamos (org_id, estado, prioridad_peso desc, created_at);
comment on index public.idx_tickets_kanban is
  'Bandeja kanban del operador (9.2): una columna por estado, ordenada por prioridad y luego por antiguedad.';

-- Indice del guardia de cupo (seccion 7) y del listado "Mis tickets" reciente
-- del cliente. idx_tickets_cliente(cliente_id, estado) no sirve para ninguno
-- de los dos: no tiene la fecha, asi que habria que visitar todas las filas
-- historicas del cliente en cada INSERT.
create index idx_tickets_cliente_creado
  on public.tickets_reclamos (cliente_id, created_at desc);
comment on index public.idx_tickets_cliente_creado is
  'Sostiene app.exigir_cupo_tickets() (conteo por cliente en la ultima hora) y el listado "Mis tickets" del portal ordenado por fecha.';

-- Badge de "sin leer" por tarjeta del kanban. Parcial: solo indexa los
-- mensajes que el operador todavia no vio, que son siempre unos pocos.
-- idx_mensajes_no_leidos_operador (2.1) sirve para el contador global de la
-- topbar (org + fecha), no para el conteo por ticket.
create index idx_mensajes_no_leidos_por_ticket
  on public.mensajes_ticket (ticket_id)
  where leido_por_operador = false;
comment on index public.idx_mensajes_no_leidos_por_ticket is
  'Contador de mensajes sin leer POR TICKET para el badge de la tarjeta del kanban.';

-- No se agrega el indice simetrico del cliente (leido_por_cliente = false):
-- ese conteo siempre corre sobre los tickets de UN cliente, que son unas
-- pocas decenas de filas ya acotadas por idx_tickets_cliente. Un indice ahi
-- solo pagaria escrituras.


-- ===========================================================================
-- 2. ultimo_mensaje_en deja de ser una columna muerta
--
--    Existe desde 2.1 y el indice idx_tickets_org (org_id, estado,
--    ultimo_mensaje_en desc) depende de ella, pero NADA la escribia: hoy es
--    NULL en el 100% de las filas. La bandeja necesita "ultima actividad"
--    para no mostrar arriba un ticket de hace tres semanas.
--
--    Se la deja NOT NULL (con default y trigger que lo garantizan) para que
--    `order by ultimo_mensaje_en desc` no tenga que arrastrar un
--    `nulls last` ni un coalesce en cada consulta de la app.
-- ===========================================================================

-- 2.1 Backfill: la mejor verdad disponible es la fecha del ultimo mensaje del
--     ticket; si no tiene mensajes, su propia fecha de creacion. No pisa
--     ningun valor ya presente.
update public.tickets_reclamos t
   set ultimo_mensaje_en = coalesce(
         (select max(m.created_at)
            from public.mensajes_ticket m
           where m.ticket_id = t.id),
         t.created_at)
 where t.ultimo_mensaje_en is null;

-- 2.2 El trigger corre ANTES del NOT NULL: un INSERT que mande NULL explicito
--     (la policy tickets_cliente_insert no restringe esta columna) queda
--     normalizado en vez de reventar con un error de Postgres en la cara del
--     cliente. Tambien mantiene cerrado_en.
create or replace function app.tickets_normalizar() returns trigger
language plpgsql security invoker set search_path = '' as $fn$
begin
  if tg_op = 'INSERT' then
    new.ultimo_mensaje_en := coalesce(new.ultimo_mensaje_en, pg_catalog.now());
    -- Un ticket nace abierto; si alguien lo crea ya cerrado, la fecha se pone
    -- sola para no chocar con chk_tickets_cerrado.
    if new.estado = 'cerrado' then
      new.cerrado_en := coalesce(new.cerrado_en, pg_catalog.now());
    else
      new.cerrado_en := null;
    end if;
    return new;
  end if;

  -- UPDATE
  new.ultimo_mensaje_en := coalesce(new.ultimo_mensaje_en,
                                    old.ultimo_mensaje_en,
                                    pg_catalog.now());

  if new.estado is distinct from old.estado then
    if new.estado = 'cerrado' then
      new.cerrado_en := pg_catalog.now();
    else
      -- Al salir de 'cerrado' la fecha de cierre deja de tener sentido.
      new.cerrado_en := null;
    end if;
  end if;

  return new;
end
$fn$;

comment on function app.tickets_normalizar() is
  'Mantiene sola la coherencia de tickets_reclamos: ultimo_mensaje_en nunca NULL y cerrado_en atado a estado=cerrado. Sin esto, arrastrar una tarjeta a "Cerrado" con un UPDATE simple viola chk_tickets_cerrado y el operador ve un error crudo de Postgres.';

revoke all on function app.tickets_normalizar() from public, anon, authenticated;

create trigger trg_tickets_normalizar
  before insert or update on public.tickets_reclamos
  for each row execute function app.tickets_normalizar();

alter table public.tickets_reclamos
  alter column ultimo_mensaje_en set default now(),
  alter column ultimo_mensaje_en set not null;

comment on column public.tickets_reclamos.ultimo_mensaje_en is
  'Ultima actividad del ticket. La mantiene app.mensajes_aplicar_en_ticket() con cada mensaje; al crear el ticket vale su fecha de creacion. NOT NULL: la bandeja ordena por esta columna.';
comment on column public.tickets_reclamos.cerrado_en is
  'La escribe app.tickets_normalizar(), no la app: se llena al entrar a estado=cerrado y se borra al salir. No mandarla a mano.';


-- ===========================================================================
-- 3. Marcas de leido coherentes por construccion
--
--    mensajes_ticket no tiene GRANT ni policy de UPDATE para NADIE
--    (authenticated=ar: solo insert y select). Es correcto —RLS filtra filas,
--    no columnas: una policy de UPDATE dejaria a quien la tenga reescribir
--    `cuerpo` y `es_interno` de mensajes ya enviados, es decir adulterar la
--    evidencia de un reclamo de cobro. Pero deja dos huecos que 9.2 necesita:
--
--    (a) El autor de un mensaje figuraba como si no lo hubiera leido, asi que
--        cada mensaje del operador inflaba su propio badge. Se resuelve en un
--        BEFORE INSERT, no en la app: ademas impide que un cliente inserte su
--        mensaje con leido_por_operador = true por PostgREST y lo esconda del
--        badge del operador (la policy de INSERT no mira esas columnas).
--    (b) Marcar como leido lo del otro: seccion 6 (RPC).
-- ===========================================================================
create or replace function app.mensajes_normalizar() returns trigger
language plpgsql security invoker set search_path = '' as $fn$
begin
  -- Quien escribe, ya leyo. Una nota interna nunca llega al cliente, asi que
  -- tampoco puede quedar "sin leer" de su lado.
  new.leido_por_operador := (new.autor_rol = 'operador');
  new.leido_por_cliente  := (new.autor_rol = 'cliente') or new.es_interno;
  return new;
end
$fn$;

comment on function app.mensajes_normalizar() is
  'Fija las marcas de leido en el INSERT: el autor ya leyo su propio mensaje y una nota interna jamas cuenta como no-leida para el cliente. Impide ademas que el cliente inserte su mensaje ya marcado como leido por el operador para esconderlo del badge.';

revoke all on function app.mensajes_normalizar() from public, anon, authenticated;

create trigger trg_mensajes_normalizar
  before insert on public.mensajes_ticket
  for each row execute function app.mensajes_normalizar();


-- ===========================================================================
-- 4. La maquina de estados de docs/eng/08 §3, aplicada al escribir
--
--    Reglas del doc (traducidas al vocabulario real, DECISION 1):
--      · "Un mensaje del CLIENTE sobre un ticket resuelto lo pasa a reabierto"
--          -> cliente escribe en `respondido`  => vuelve a `abierto`.
--      · "Un mensaje del OPERADOR sobre un ticket nuevo lo pasa a en_revision"
--          -> operador escribe en `abierto`    => pasa a `en_proceso`.
--      · Una nota interna NUNCA cambia el estado (no es una respuesta).
--
--    DESVIACION DELIBERADA del doc: "cerrado no admite nuevos mensajes; se
--    crea un ticket nuevo enlazado (related_ticket_id)". Aca, si el cliente
--    escribe sobre un ticket cerrado, el ticket se REABRE. Razones:
--      · Para una PYME no tecnica, "no puedes responder, abre otro" es un
--        muro; "seguimos conversando" es lo que espera.
--      · related_ticket_id no existe en el esquema y crearlo solo para esto
--        obliga a construir la cadena de tickets relacionados en la UI, que
--        no esta en el alcance de 9.1/9.2.
--      · El cliente YA puede reabrir su ticket con
--        public.cambiar_estado_mi_ticket(id, 'abierto'): bloquear el mensaje
--        solo lo obligaria a hacer dos clics para el mismo resultado.
--    Queda anotado como deuda si algun dia entra el auto-cierre a 7 dias.
--
--    Por que trigger y no logica del Route Handler: es la misma razon de la
--    DECISION 2. El INSERT del mensaje es alcanzable directo por PostgREST
--    (policy mensajes_participante_insert). Si la transicion viviera en la
--    app, un cliente podria responder sin que su ticket saliera de
--    `respondido` y la bandeja del operador mentiria.
-- ===========================================================================
create or replace function app.mensajes_aplicar_en_ticket() returns trigger
language plpgsql security definer set search_path = '' as $fn$
begin
  -- SECURITY DEFINER (dueno postgres, BYPASSRLS) a proposito: el cliente NO
  -- tiene policy de UPDATE sobre tickets_reclamos —ni debe tenerla—, asi que
  -- un trigger INVOKER actualizaria 0 filas y ultimo_mensaje_en se quedaria
  -- congelado justo para los mensajes del cliente. La funcion no recibe
  -- ningun parametro del usuario: solo lee NEW, ya validado por la policy de
  -- INSERT (org_id, autor_id y autor_rol vienen de la sesion, no del payload).
  update public.tickets_reclamos t
     -- GREATEST no lleva prefijo de esquema: es sintaxis del parser, no una
     -- funcion de pg_catalog, asi que `pg_catalog.greatest(...)` no existe.
     -- Funciona igual con search_path vacio por la misma razon.
     set ultimo_mensaje_en = greatest(t.ultimo_mensaje_en, new.created_at),
         estado = case
           when new.es_interno then t.estado
           when new.autor_rol = 'cliente'  and t.estado in ('respondido', 'cerrado')
             then 'abierto'
           when new.autor_rol = 'operador' and t.estado = 'abierto'
             then 'en_proceso'
           else t.estado
         end
   where t.id = new.ticket_id
     and t.org_id = new.org_id;

  return null;
end
$fn$;

comment on function app.mensajes_aplicar_en_ticket() is
  'Cada mensaje actualiza su ticket: refresca ultimo_mensaje_en y aplica la maquina de estados de docs/eng/08 §3 (cliente responde un ticket respondido/cerrado -> abierto; operador responde uno abierto -> en_proceso; nota interna no cambia nada). Vive en la BD y no en el Route Handler porque el INSERT de mensajes es alcanzable directo por PostgREST.';

revoke all on function app.mensajes_aplicar_en_ticket() from public, anon, authenticated;

create trigger trg_mensajes_aplicar_en_ticket
  after insert on public.mensajes_ticket
  for each row execute function app.mensajes_aplicar_en_ticket();


-- ===========================================================================
-- 5. Auditoria automatica (docs/eng/08 §14, CLAUDE.md regla 5)
--
--    "Cada cambio de estado y prioridad queda registrado (quien, cuando, de
--    que a que)". Ver DECISION 2 arriba: va en trigger, no en RPC, porque el
--    UPDATE directo del operador seguira existiendo.
--
--    Tres acciones, con el mismo estilo `entidad.accion` que ya usa Fase 5
--    ('api_key.alta', 'api_key.rotacion', 'api_key.revocacion'):
--      ticket.alta · ticket.cambio_estado · ticket.cambio_prioridad
--
--    actor_id/actor_rol salen de los helpers de sesion, NUNCA de la fila. Si
--    el cambio lo hizo el backend con service_role no hay usuario detras:
--    actor_id NULL + actor_rol 'sistema' (la FK compuesta a usuarios es MATCH
--    SIMPLE, con actor_id NULL no se exige nada).
--
--    SECURITY DEFINER porque authenticated no tiene INSERT sobre audit_log
--    (a proposito: §7.11 de 2.1 solo le dio SELECT al operador). El dueno
--    postgres tiene BYPASSRLS, mismo camino que ya usan los RPC de 5.1.
--    audit_log sigue siendo append-only: esto solo inserta.
-- ===========================================================================
create or replace function app.auditar_ticket() returns trigger
language plpgsql security definer set search_path = '' as $fn$
declare
  v_actor uuid := app.current_usuario_id();
  v_rol   text := coalesce(app.current_rol(), 'sistema');
begin
  if tg_op = 'INSERT' then
    insert into public.audit_log (org_id, actor_id, actor_rol, accion,
                                  entidad, entidad_id, datos)
    values (new.org_id, v_actor, v_rol, 'ticket.alta',
            'tickets_reclamos', new.id,
            pg_catalog.jsonb_build_object(
              'tipo',       new.tipo,
              'asunto',     new.asunto,
              'prioridad',  new.prioridad,
              'cliente_id', new.cliente_id));
    return null;
  end if;

  if new.estado is distinct from old.estado then
    insert into public.audit_log (org_id, actor_id, actor_rol, accion,
                                  entidad, entidad_id, datos)
    values (new.org_id, v_actor, v_rol, 'ticket.cambio_estado',
            'tickets_reclamos', new.id,
            pg_catalog.jsonb_build_object('antes', old.estado,
                                          'despues', new.estado));
  end if;

  if new.prioridad is distinct from old.prioridad then
    insert into public.audit_log (org_id, actor_id, actor_rol, accion,
                                  entidad, entidad_id, datos)
    values (new.org_id, v_actor, v_rol, 'ticket.cambio_prioridad',
            'tickets_reclamos', new.id,
            pg_catalog.jsonb_build_object('antes', old.prioridad,
                                          'despues', new.prioridad));
  end if;

  return null;
end
$fn$;

comment on function app.auditar_ticket() is
  'Escribe en audit_log el alta del ticket y cada cambio de estado o prioridad, venga del UPDATE directo del operador, del RPC del cliente, del trigger de mensajes o del backend con service_role. Es la unica forma de cumplir docs/eng/08 §14 sin poder quitarle el UPDATE directo al operador.';

revoke all on function app.auditar_ticket() from public, anon, authenticated;

-- La condicion WHEN evita una fila de auditoria por cada UPDATE que solo toca
-- ultimo_mensaje_en (o sea, por cada mensaje del hilo).
create trigger trg_tickets_auditar_alta
  after insert on public.tickets_reclamos
  for each row execute function app.auditar_ticket();

create trigger trg_tickets_auditar_cambios
  after update on public.tickets_reclamos
  for each row
  when (old.estado is distinct from new.estado
        or old.prioridad is distinct from new.prioridad)
  execute function app.auditar_ticket();


-- ===========================================================================
-- 6. RPC: marcar como leido
--
--    Unica via posible (ver seccion 3): la tabla no tiene UPDATE para nadie
--    salvo service_role. Mismo molde que actualizar_mi_perfil /
--    actualizar_limite_mensual_cliente: SECURITY DEFINER, search_path vacio,
--    el tenant sale de los helpers de sesion y JAMAS de un parametro, y toca
--    una sola cosa (las marcas de leido). No puede cambiar `cuerpo`,
--    `es_interno` ni el autor.
--
--    Devuelve cuantas filas marco, para que la UI pueda apagar el badge sin
--    tener que volver a consultar.
-- ===========================================================================
create or replace function public.marcar_mensajes_leidos(p_ticket_id uuid)
returns integer
language plpgsql security definer set search_path = '' as $fn$
declare
  v_org     uuid := app.current_org_id();
  v_cliente uuid := app.current_cliente_id();
  v_rol     text := app.current_rol();
  v_n       integer := 0;
begin
  if v_org is null or v_rol is null then
    raise exception 'Necesitas iniciar sesion.' using errcode = '42501';
  end if;

  -- El ticket se resuelve con el tenant de la SESION. Un id de otra org (o
  -- inexistente) simplemente no encuentra fila: mismo mensaje generico que
  -- cambiar_estado_mi_ticket, para no filtrar la existencia de ids ajenos.
  if not exists (
    select 1 from public.tickets_reclamos t
    where t.id = p_ticket_id
      and t.org_id = v_org
      and (v_rol = 'operador' or t.cliente_id = v_cliente)
  ) then
    raise exception 'No encontramos ese ticket.' using errcode = '42501';
  end if;

  if v_rol = 'operador' then
    update public.mensajes_ticket m
       set leido_por_operador = true
     where m.ticket_id = p_ticket_id
       and m.org_id = v_org
       and m.leido_por_operador = false;
  else
    -- El cliente jamas marca (ni sabe de) una nota interna.
    update public.mensajes_ticket m
       set leido_por_cliente = true
     where m.ticket_id = p_ticket_id
       and m.org_id = v_org
       and m.es_interno = false
       and m.leido_por_cliente = false;
  end if;

  get diagnostics v_n = row_count;
  return v_n;
end
$fn$;

comment on function public.marcar_mensajes_leidos(uuid) is
  'Marca como leidos los mensajes de UN ticket para quien llama (operador o cliente). Unica escritura posible sobre mensajes_ticket desde el frontend: la tabla no tiene GRANT ni policy de UPDATE, a proposito, para que nadie pueda reescribir el cuerpo ni el flag es_interno de un mensaje ya enviado. Devuelve cuantos marco.';

revoke all on function public.marcar_mensajes_leidos(uuid) from public, anon;
grant execute on function public.marcar_mensajes_leidos(uuid)
  to authenticated, service_role;


-- ===========================================================================
-- 7. Tope de creacion de tickets DENTRO de la base (docs/eng/08 §14)
--
--    POR QUE NO ALCANZA CON EL ROUTE HANDLER
--      Mismo hallazgo que MEDIO-1 de la tarea 5.1. La policy
--      tickets_cliente_insert habilita el INSERT directo por PostgREST: un
--      cliente autenticado que saque su JWT del navegador puede crear tickets
--      sin pasar jamas por el codigo de Next.js. Sin tope en la BD, eso son
--      filas ilimitadas en tickets_reclamos y —peor— una fila por ticket en
--      public.audit_log (seccion 5), que es append-only y no se puede borrar
--      ni con service_role. Ademas inunda la bandeja del operador, que es la
--      herramienta con la que atiende a TODOS sus clientes.
--      Es menos grave que el caso de las API keys (aca no hay un secreto de
--      por medio, es spam), pero el costo de cerrarlo es una funcion y un
--      indice, y la consecuencia de no cerrarlo cae sobre una tabla inmutable
--      y compartida. Se cierra.
--
--    POR CLIENTE, NO POR ORG
--      docs/eng/08 §14 dice "10 tickets por org por hora" asumiendo una org
--      por empresa cliente. En el modelo real hay UNA org (la del operador)
--      con muchos `clientes`: contar por org significaria que el cliente que
--      abre 10 tickets deja sin canal de soporte a todos los demas clientes
--      de Kaudal. Es la misma correccion que ya se hizo en
--      app.exigir_cupo_api_keys. Se conserva el numero del doc (10) y se
--      cambia el sujeto (cliente).
--
--    QUIEN QUEDA EXENTO
--      Solo una sesion con rol 'operador'. El operador abriendo un ticket a
--      nombre de un cliente es un acto humano y confiable, y limitarlo
--      significaria que atender una racha de reclamos lo bloquea a el.
--      Todo lo demas —cliente, service_role, postgres— queda sujeto al tope:
--      no hay puerta trasera que un atacante pueda buscar. Una carga masiva
--      legitima tendria que desactivar el trigger explicitamente (ALTER TABLE
--      ... DISABLE TRIGGER), que exige ser dueno de la tabla; es decir, una
--      decision deliberada de DBA y no algo alcanzable desde la app.
--
--    EL ADVISORY LOCK NO ES DECORATIVO: sin el, N inserts en paralelo leen el
--    contador antes de que cualquiera haga commit (READ COMMITTED), todos ven
--    9 y todos entran. La clave incluye el cliente_id, asi que un cliente
--    solo puede hacerse esperar a si mismo, nunca a otro tenant.
-- ===========================================================================
create or replace function app.exigir_cupo_tickets() returns trigger
language plpgsql security definer set search_path = '' as $fn$
declare
  c_ventana constant interval := interval '1 hour';
  c_max     constant integer  := 10;
  v_usados  integer;
begin
  if app.current_rol() = 'operador' then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('kaudal.ticket.' || new.cliente_id::text, 0)
  );

  select pg_catalog.count(*)
    into v_usados
  from public.tickets_reclamos t
  where t.cliente_id = new.cliente_id
    and t.org_id = new.org_id
    and t.created_at >= pg_catalog.now() - c_ventana;

  if v_usados >= c_max then
    -- PT429: PostgREST traduce la clase PT a HTTP tal cual, asi que quien
    -- llame el INSERT directo recibe el mismo 429 que dara el Route Handler.
    -- Mensaje humano y sin revelar el tope exacto.
    raise exception 'Abriste varias solicitudes seguidas. Espera un momento antes de crear otra.'
      using errcode = 'PT429',
            hint    = 'Vuelve a intentarlo en unos minutos.';
  end if;

  return new;
end
$fn$;

comment on function app.exigir_cupo_tickets() is
  'Tope de docs/eng/08 §14 (10 tickets/hora) aplicado POR CLIENTE dentro de la BD, no por org: un cliente abusivo no deja sin canal de soporte a los demas. Vive aca y no en el Route Handler porque tickets_cliente_insert habilita el INSERT directo por PostgREST. Exento solo el rol operador.';

revoke all on function app.exigir_cupo_tickets() from public, anon, authenticated;

create trigger trg_tickets_cupo
  before insert on public.tickets_reclamos
  for each row execute function app.exigir_cupo_tickets();


-- ===========================================================================
-- 8. Adjuntos: bucket privado `ticket-attachments` (docs/eng/08 §7)
-- ===========================================================================

-- 8.1 El bucket.
--     public = false: no existe URL publica fija; el backend firma URLs de
--     corta duracion (§7). Los limites del doc se declaran TAMBIEN aca y no
--     solo en el Route Handler: mismo criterio que el GRANT por columna de
--     `agentes` en 6.1 —la app no puede ser el unico control—. Si alguien
--     sube con el JWT directo contra la Storage API, el bucket rechaza igual.
--
--     Sobre la lista de MIME: docs/eng/08 §7 permite png/jpg/jpeg/pdf/csv/
--     txt/log/json, que son EXTENSIONES. Aca hay que declarar MIME types, y
--     `.log` no tiene uno registrado. El Route Handler debe normalizar antes
--     de subir: .log y .txt -> text/plain, .jpg -> image/jpeg. NO se agrega
--     application/octet-stream: seria el comodin que anula la lista entera.
--
--     El limite de "5 adjuntos por mensaje" de §7 NO se puede expresar aca
--     (Storage no conoce el mensaje): queda para el Route Handler, junto con
--     la validacion de extension real del archivo.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ticket-attachments',
  'ticket-attachments',
  false,
  10485760,  -- 10 MiB por archivo (docs/eng/08 §7)
  array[
    'image/png',
    'image/jpeg',
    'application/pdf',
    'text/csv',
    'text/plain',        -- .txt y .log (normalizados por el backend)
    'application/json'
  ]
)
on conflict (id) do nothing;

-- 8.2 Cast seguro de un segmento del path.
--     Sin esto, un objeto con un nombre de carpeta que no sea un uuid haria
--     que el `::uuid` de la politica lance excepcion y la consulta entera
--     falle (un error, no un "no autorizado"). Devuelve NULL y la politica
--     niega, que es como debe fallar.
create or replace function app.uuid_o_null(p_texto text) returns uuid
language plpgsql immutable strict set search_path = '' as $fn$
begin
  return p_texto::uuid;
exception when others then
  return null;
end
$fn$;

comment on function app.uuid_o_null(text) is
  'Cast texto->uuid que devuelve NULL en vez de lanzar excepcion. Se usa al leer segmentos del path de storage.objects, donde un nombre arbitrario no debe poder romper la evaluacion de una politica RLS.';

-- Sin EXECUTE para nadie: la unica que la llama es
-- app.puede_tocar_adjunto_ticket(), que es SECURITY DEFINER y por lo tanto la
-- invoca como su dueno. Un helper interno no tiene por que estar publicado.
revoke all on function app.uuid_o_null(text) from public, anon, authenticated;

-- 8.3 El guardia de los adjuntos.
--     Ruta obligatoria: {org_id}/{ticket_id}/{uuid}-{filename}
--     - org_id primero para que el aislamiento de tenant se lea en el primer
--       segmento, antes de tocar ninguna tabla.
--     - Exactamente DOS carpetas: nada suelto en la raiz del bucket y nada
--       anidado mas profundo. Un path fuera de esa forma se niega.
--
--     SECURITY DEFINER a proposito: hace su propia verificacion de tenant en
--     vez de apoyarse en la RLS de tickets_reclamos evaluada dentro de otra
--     RLS. Es mas predecible y no depende de que las policies de tickets
--     sigan siendo las de hoy. El unico parametro es el nombre del objeto que
--     Postgres le pasa desde la fila; el tenant NUNCA viene de un parametro.
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
  -- Sin sesion valida no hay nada que autorizar.
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

  -- Aislamiento de tenant: el primer segmento tiene que ser MI org.
  if v_org_ruta <> v_org then
    return false;
  end if;

  -- Y el segundo, un ticket que me corresponde. El operador ve todos los de
  -- su org; el cliente, solo los suyos (no le basta con acertar el org_id).
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

-- 8.4 Politicas sobre storage.objects.
--     storage.objects tiene RLS habilitada y CERO politicas: hoy todo esta
--     denegado para anon/authenticated y hay que abrir lo justo (falla
--     cerrada, mismo criterio de toda la Fase 2). Las politicas van `to
--     authenticated`: `anon` sigue sin ninguna, o sea sin acceso.
--
--     SOLO SELECT E INSERT. Deliberado:
--       · Sin UPDATE  -> nadie puede sobreescribir (upsert) un adjunto ya
--         subido. Los nombres llevan un uuid, asi que no hay colisiones que
--         resolver, y un adjunto es evidencia de un reclamo: cambiarle el
--         contenido dejando la misma ruta seria adulterarla.
--       · Sin DELETE  -> misma razon; un cliente no borra la prueba de lo que
--         adjunto. Si hay que eliminar un archivo (por ejemplo un dato
--         personal subido por error, Ley 19.628), lo hace el backend con
--         service_role, que bypassa RLS, dejando registro. Nota: storage trae
--         ademas el trigger protect_objects_delete, que bloquea el DELETE por
--         SQL directo para todos —solo la Storage API borra.
create policy adjuntos_ticket_select on storage.objects
  for select to authenticated
  using (bucket_id = 'ticket-attachments'
         and app.puede_tocar_adjunto_ticket(name));

create policy adjuntos_ticket_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'ticket-attachments'
              and app.puede_tocar_adjunto_ticket(name));

-- 8.5 Limitacion conocida (no corregible desde esta migracion)
--     storage.objects pertenece a supabase_storage_admin y trae GRANT ALL
--     para anon y authenticated —incluido TRUNCATE, que ignora RLS—. En 2.2
--     se revoco ese mismo privilegio en public.audit_log, pero aca el REVOKE
--     es inoperante: quien concedio fue supabase_storage_admin y el rol
--     `postgres` de las migraciones no es miembro suyo (verificado: el REVOKE
--     reporta exito y el ACL queda igual). Mitigacion: TRUNCATE no es
--     alcanzable ni por PostgREST ni por la Storage API; requiere una
--     conexion SQL directa a la base, que ningun usuario final tiene. Queda
--     anotado para el hardening de despliegue (Fase 11), donde se puede
--     ejecutar como supabase_admin.

-- 8.6 El otro limite de §7: "hasta 5 adjuntos por mensaje".
--     Este SI es expresable en la BD, sobre mensajes_ticket.adjuntos (jsonb,
--     existe desde 2.1 sin ninguna restriccion de forma). Sin el CHECK, un
--     INSERT directo por PostgREST puede mandar 500 adjuntos —o un objeto, o
--     un numero— en esa columna y el hilo del operador queda inutilizable.
--     El Route Handler valida igual (mensaje amable + tipos + tamano), pero
--     no es el unico control.
--
--     Se validan forma y cantidad, no el contenido de cada elemento: exigir
--     claves especificas en el jsonb seria un contrato rigido que rompe la
--     primera vez que se agregue un campo. La forma esperada por la UI es
--     [{ "ruta": "...", "nombre": "...", "mime": "...", "tamano_bytes": 0 }].
alter table public.mensajes_ticket
  add constraint chk_mensajes_adjuntos
  check (jsonb_typeof(adjuntos) = 'array' and jsonb_array_length(adjuntos) <= 5);

comment on column public.mensajes_ticket.adjuntos is
  'Arreglo JSON con los adjuntos del mensaje, maximo 5 (docs/eng/08 §7). Forma esperada: [{"ruta": "{org_id}/{ticket_id}/{uuid}-archivo.png", "nombre": "captura.png", "mime": "image/png", "tamano_bytes": 12345}]. `ruta` apunta al objeto en el bucket ticket-attachments; el frontend nunca guarda una URL, siempre pide una firmada al backend.';
