-- ============================================================================
-- Kaudal · Seguimiento de seguridad de la tarea 9.1 (adjuntos de tickets)
-- Cierra los 2 hallazgos de security-auditor sobre
--   supabase/migrations/20260827200000_tickets_adjuntos_9_1.sql
-- Fuente: docs/eng/08-reclamos-y-soporte.md §7 (adjuntos), CLAUDE.md regla 2
--         (todo dato se aisla por empresa; seguro por defecto).
--
-- ALCANCE ESTRICTO
--   Esta migracion toca UNICAMENTE la superficie de storage.objects. NO vuelve
--   sobre nada de lo que ya se audito y aprobo en 9.1: el vocabulario de
--   estado/prioridad (DECISION 1), los triggers de tickets_reclamos y
--   mensajes_ticket, la maquina de estados, la auditoria, el RPC
--   marcar_mensajes_leidos, cambiar_estado_mi_ticket, el tope de creacion de
--   tickets, ni el file_size_limit / allowed_mime_types del bucket.
--
-- ---------------------------------------------------------------------------
-- HALLAZGO ALTO · Los adjuntos de una NOTA INTERNA eran legibles por el cliente
-- ---------------------------------------------------------------------------
--   Sintoma. La ruta de 9.1 era {org_id}/{ticket_id}/{uuid}-{nombre} y
--   app.puede_tocar_adjunto_ticket() solo preguntaba "es tu ticket?". Un
--   mensaje con es_interno = true SI queda escondido del cliente (la policy
--   mensajes_participante de la Fase 2 filtra por es_interno), pero su ADJUNTO
--   caia en la misma carpeta que los adjuntos publicos del mismo ticket. Un
--   cliente que saque su JWT del navegador y hable directo con storage.objects
--   --select, o `list` via storage.search(), que es SECURITY INVOKER y por lo
--   tanto pasa por RLS-- podia listar la carpeta de SU ticket, descubrir el
--   nombre del objeto y pedir una URL firmada. El uuid del nombre no es un
--   control de acceso: es un control de colisiones.
--   Rompia la promesa literal que la UI le hace al operador cuando marca la
--   casilla ("Nota interna: el cliente no la ve"), que es justo donde el
--   operador escribe cosas como la evidencia de un cobro en disputa.
--
--   Fix. La visibilidad pasa a ser un SEGMENTO DE LA RUTA, no un dato que hay
--   que ir a buscar a otra tabla:
--
--       {org_id}/{ticket_id}/{visibilidad}/{uuid}-{nombre}
--                             ^ 'publico' | 'interno'
--
--   y 'interno' exige rol operador en la sesion. Se eligio esto en vez de
--   correlacionar el objeto con su fila en mensajes_ticket porque:
--     · La correlacion NO existe al momento del INSERT: el archivo se sube
--       ANTES de que exista el mensaje (el mensaje guarda la ruta en
--       `adjuntos`). Una policy que mirara mensajes_ticket tendria que dejar
--       pasar todo adjunto "todavia sin mensaje", o sea todo.
--     · Aun despues, la relacion vive dentro de un jsonb: la policy tendria
--       que hacer un jsonb_array_elements sobre los mensajes del ticket en
--       CADA fila de storage.objects evaluada. Caro y fragil.
--     · La ruta la decide el backend (src/lib/tickets/adjuntos.ts), pero la
--       AUTORIZACION la decide la base mirando esa ruta. El cliente no puede
--       escribir bajo 'interno' aunque arme el path a mano: la policy se lo
--       niega. Es el mismo criterio de toda la fase --la app no es el unico
--       control--, solo que aca el dato que faltaba se movio a donde la policy
--       si lo puede leer barato.
--
--   Efecto lateral buscado: el operador SIGUE viendo todo (publico e interno),
--   asi que el hilo del operador no pierde nada.
--
-- ---------------------------------------------------------------------------
-- HALLAZGO MEDIO · El bucket no tenia tope ni recolector
-- ---------------------------------------------------------------------------
--   Sintoma. adjuntos_ticket_insert no limitaba la cantidad de objetos, y NO
--   existe ninguna via de borrado: no hay policy de DELETE (a proposito: un
--   adjunto es evidencia de un reclamo) y ademas storage trae el trigger
--   protect_objects_delete, que bloquea el DELETE por SQL directo para todos.
--   O sea: almacenamiento facturable que solo crece. El INSERT es alcanzable
--   directo por la Storage API con el JWT del cliente, saltandose el
--   rate-limit en memoria del Route Handler --es exactamente el MEDIO-1 de la
--   tarea 5.1 y la §7 de la migracion original (app.exigir_cupo_tickets),
--   pero para storage.objects nunca se cerro--.
--
--   Fix. app.hay_cupo_adjuntos_ticket() cuenta cuantos objetos ya viven bajo
--   {org_id}/{ticket_id}/ y niega el INSERT a partir de 30. El numero sale de
--   docs/eng/08 §7 ("hasta 5 adjuntos por mensaje"): 5 mensajes con adjuntos
--   por hilo x 5 archivos = 25, mas margen = 30.
--
-- ---------------------------------------------------------------------------
-- MIGRACION DE DATOS: NINGUNA
-- ---------------------------------------------------------------------------
--   El bucket ticket-attachments esta VACIO (verificado:
--   select count(*) from storage.objects where bucket_id='ticket-attachments'
--   -> 0). No hay ni un objeto con la ruta vieja de 2 segmentos que quedaria
--   inalcanzable. Si en el futuro se repitiera un cambio de forma de ruta con
--   objetos dentro, habria que mover los objetos con la Storage API ANTES
--   (copy + delete con service_role), porque desde SQL no se pueden borrar.
--
-- Rollback: supabase/rollbacks/20260827210000_tickets_adjuntos_9_1_seguimiento_down.sql
-- Reversible: solo reemplaza dos funciones y el WITH CHECK de una policy. No
-- escribe ni borra una sola fila.
-- ============================================================================


-- ===========================================================================
-- 1. app.puede_tocar_adjunto_ticket() v2: 3 segmentos y visibilidad
--
--    CREATE OR REPLACE con la MISMA firma a proposito: las dos policies
--    (adjuntos_ticket_select / adjuntos_ticket_insert) siguen apuntando a esta
--    funcion sin tocarlas, asi que no hay ni un instante de la transaccion en
--    que el bucket quede sin guardia.
--
--    Sigue siendo SECURITY DEFINER por lo mismo que en 9.1: hace su propia
--    verificacion de tenant en vez de anidar la RLS de tickets_reclamos dentro
--    de la RLS de storage.objects. El unico parametro es el `name` que
--    Postgres le pasa desde la fila; org, rol y cliente SIEMPRE salen de los
--    helpers de sesion, nunca de un argumento.
--
--    NOVEDAD: se exige la FORMA CANONICA del uuid en la ruta
--    (v_partes[i] = uuid::text, o sea minusculas y con guiones). No es
--    cosmetico:
--      · uuid_in() de Postgres acepta variantes que castean igual pero son
--        strings distintos: mayusculas (A0EE...), llaves ({a0ee...}), guiones
--        en otras posiciones. Sin canonicalizar, el MISMO ticket tendria
--        infinitas carpetas distintas, y el tope de la seccion 2 --que cuenta
--        por prefijo de texto-- se saltaria generando una variante nueva por
--        cada 30 archivos.
--      · Ademas garantiza que el prefijo que arma la seccion 2 solo contiene
--        [0-9a-f-]: sin '%', sin '_', sin '\'. El LIKE queda demostrablemente
--        libre de metacaracteres, no solo "probablemente".
--    El backend ya manda los ids en minusculas (src/lib/tickets/adjuntos.ts
--    normaliza al armar la ruta), asi que esto no rechaza nada legitimo.
-- ===========================================================================
create or replace function app.puede_tocar_adjunto_ticket(p_name text)
returns boolean
language plpgsql stable security definer set search_path = '' as $fn$
declare
  v_org         uuid := app.current_org_id();
  v_rol         text := app.current_rol();
  v_cliente     uuid := app.current_cliente_id();
  v_partes      text[];
  v_org_ruta    uuid;
  v_ticket      uuid;
  v_visibilidad text;
begin
  -- Sin sesion valida no hay nada que autorizar.
  if v_org is null or v_rol is null then
    return false;
  end if;

  -- Exactamente TRES carpetas: org / ticket / visibilidad. Nada suelto en la
  -- raiz, nada mas anidado, y --importante para el cambio de 9.1-- la ruta
  -- vieja de dos segmentos ya no se acepta: no queda forma de volver a dejar
  -- un adjunto en la carpeta ambigua donde el cliente lo alcanzaba.
  v_partes := storage.foldername(p_name);
  if pg_catalog.array_length(v_partes, 1) is distinct from 3 then
    return false;
  end if;

  -- app.uuid_o_null (9.1 §8.2) devuelve NULL en vez de lanzar excepcion: un
  -- nombre de carpeta arbitrario debe DENEGAR, no romper la evaluacion de la
  -- politica con un error de cast.
  v_org_ruta := app.uuid_o_null(v_partes[1]);
  v_ticket   := app.uuid_o_null(v_partes[2]);
  if v_org_ruta is null or v_ticket is null then
    return false;
  end if;

  -- Forma canonica obligatoria (ver cabecera de la seccion).
  if v_partes[1] <> v_org_ruta::text or v_partes[2] <> v_ticket::text then
    return false;
  end if;

  -- Aislamiento de tenant: el primer segmento tiene que ser MI org.
  if v_org_ruta <> v_org then
    return false;
  end if;

  -- Visibilidad: vocabulario cerrado. Cualquier otra cosa ('publico2',
  -- 'INTERNO', vacio, un uuid) se niega, asi que no hay una tercera carpeta
  -- posible donde algo quede sin regla.
  v_visibilidad := v_partes[3];
  if v_visibilidad not in ('publico', 'interno') then
    return false;
  end if;

  -- EL PUNTO DEL HALLAZGO ALTO: la carpeta 'interno' es del operador. El
  -- cliente no la lee (select/list) ni la escribe, aunque el ticket sea suyo
  -- y aunque acierte el nombre exacto del objeto.
  if v_visibilidad = 'interno' and v_rol <> 'operador' then
    return false;
  end if;

  -- Y el segundo segmento, un ticket que me corresponde. El operador ve todos
  -- los de su org; el cliente, solo los suyos (no le basta con acertar el
  -- org_id, que es adivinable si alguna vez vio una ruta propia).
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
  'Autoriza un objeto del bucket ticket-attachments segun su ruta {org_id}/{ticket_id}/{visibilidad}/{archivo}: exige la org de la sesion en el primer segmento (en forma canonica de uuid), un ticket que quien llama puede ver en el segundo, y visibilidad publico|interno en el tercero, donde "interno" es SOLO para el rol operador. Sin ese tercer segmento (v1 de 9.1) el adjunto de una nota interna quedaba legible por el cliente duenno del ticket via storage.objects. Cualquier ruta con otra forma se niega.';

revoke all on function app.puede_tocar_adjunto_ticket(text) from public, anon;
grant execute on function app.puede_tocar_adjunto_ticket(text)
  to authenticated, service_role;


-- ===========================================================================
-- 2. Tope de objetos por ticket (hallazgo MEDIO)
--
--    POR QUE SECURITY DEFINER
--      El conteo tiene que ver TODOS los objetos del ticket, incluidos los de
--      la carpeta 'interno' que la sesion del cliente no puede leer. Con
--      SECURITY INVOKER el cliente contaria solo lo publico y el tope real
--      seria 30 por visibilidad; peor: la consulta pasaria por la RLS de
--      storage.objects, es decir se evaluaria una policy DENTRO de la
--      evaluacion de otra policy. El dueno (postgres) tiene BYPASSRLS, mismo
--      camino que ya usan app.auditar_ticket() y
--      app.mensajes_aplicar_en_ticket().
--
--    POR QUE DEVUELVE false Y NO LANZA UNA EXCEPCION AMABLE
--      Seria tentador hacer `raise ... using errcode = 'PT429'` como en
--      app.exigir_cupo_tickets(), para que el usuario vea "ya subiste
--      demasiados archivos" en vez de un rechazo generico. No se hace: dentro
--      de un WITH CHECK, Postgres NO garantiza el orden de evaluacion de los
--      AND. Si esta funcion corriera antes que puede_tocar_adjunto_ticket(),
--      un atacante que apunte al prefijo de un ticket AJENO recibiria "cupo
--      lleno" en vez de "denegado", filtrando cuantos adjuntos tiene un ticket
--      de otro tenant. Un booleano no filtra nada: el AND da false igual.
--      Costo: el usuario ve el mismo mensaje que cualquier otro rechazo del
--      bucket. Queda anotado como deuda de copy en la UI.
--
--    POR QUE NO HAY ADVISORY LOCK (a diferencia de app.exigir_cupo_tickets)
--      Alla el lock era imprescindible: sin el, N inserts en paralelo leen el
--      contador antes de cualquier commit y TODOS entran, y la consecuencia
--      caia sobre public.audit_log, que es append-only e imborrable. Aca:
--        · Un lock de transaccion tomado desde dentro de un WITH CHECK es un
--          efecto secundario en un lugar que el planner trata como predicado
--          puro (puede evaluarlo una vez, por fila, o no evaluarlo si otro
--          AND ya dio false). Es fragil por construccion.
--        · El desborde por carrera esta acotado por la concurrencia del
--          atacante (unos pocos objetos de mas), no es ilimitado, y no cruza
--          ninguna frontera de seguridad: son bytes, no datos ajenos.
--        · El techo global ya existe por otro lado: app.exigir_cupo_tickets()
--          limita a 10 tickets/hora por cliente, y cada ticket topa en 30
--          objetos de 10 MiB.
--      Se acepta el desborde por carrera de forma explicita.
--
--    EL OPERADOR QUEDA EXENTO
--      Mismo criterio que app.exigir_cupo_tickets(): el sujeto no confiable es
--      el JWT del cliente. Y hay una razon operativa fuerte: NO existe ninguna
--      via de borrado desde la app, asi que un operador que choque con el tope
--      en un hilo largo y legitimo se queda sin poder adjuntar nada mas y sin
--      forma de liberar espacio. Contrapartida conocida: como el conteo es por
--      prefijo del ticket (sin mirar la visibilidad), los archivos que suba el
--      operador SI consumen el cupo del cliente en ese ticket. Se prefiere asi
--      --es el tope mas conservador para el gasto real de almacenamiento-- y
--      el caso "el operador subio 30 archivos a un mismo ticket" es visible y
--      raro.
--
--    SOBRE EL LIKE Y LA INYECCION DE PATRONES
--      El prefijo se arma con los DOS primeros segmentos CRUDOS del path, no
--      con el uuid casteado, porque storage.objects.name guarda el texto tal
--      cual. Ese texto ya paso por puede_tocar_adjunto_ticket()... en la MISMA
--      policy, pero --de nuevo-- sin orden garantizado, asi que esta funcion
--      revalida por su cuenta en vez de asumirlo: exige que cada segmento sea
--      un uuid EN FORMA CANONICA, o sea 32 digitos hex en minuscula y 4
--      guiones. Bajo esa condicion es imposible que el prefijo contenga '%',
--      '_' o '\'. Igual se escapan los tres antes del LIKE: no cuesta nada y
--      deja de depender de un razonamiento sobre uuid_in().
--
--    PLAN (medido, no supuesto). Con 5.005 objetos en el bucket:
--      Index Only Scan using idx_objects_bucket_id_name
--        Index Cond: bucket_id = 'ticket-attachments'
--                    AND name >= '{org}/{ticket}/' AND name < '{org}/{ticket}0'
--        actual rows=5, Execution Time: 0.134 ms
--    O sea: el planner convierte el LIKE de prefijo en un rango sobre
--    idx_objects_bucket_id_name (bucket_id, name COLLATE "C"), que ya existe
--    en storage.objects, y visita solo los objetos de ESE ticket --nunca los
--    de los demas--. Por eso el prefijo se compara con LIKE y no con
--    left(name, n) = prefijo ni con storage.foldername(name)[1..2]: esas dos
--    formas son igual de seguras pero obligan a un scan completo del bucket.
--    No se crea ningun indice nuevo aca: la tabla es de supabase_storage_admin
--    y el rol de las migraciones no es miembro suyo (ver 9.1 §8.5).
-- ===========================================================================
create or replace function app.hay_cupo_adjuntos_ticket(p_name text)
returns boolean
language plpgsql stable security definer set search_path = '' as $fn$
declare
  c_max      constant integer := 30;  -- 5 mensajes x 5 adjuntos (docs/eng/08 §7) + margen
  v_partes   text[];
  v_org_ruta uuid;
  v_ticket   uuid;
  v_prefijo  text;
  v_usados   bigint;
begin
  -- El operador no tiene tope (ver cabecera).
  if app.current_rol() = 'operador' then
    return true;
  end if;

  v_partes := storage.foldername(p_name);
  if pg_catalog.array_length(v_partes, 1) is distinct from 3 then
    -- Forma invalida: negarla es asunto de puede_tocar_adjunto_ticket(), pero
    -- aca tampoco se puede contar un prefijo que no existe. Se niega, que es
    -- como debe fallar lo que no se entiende.
    return false;
  end if;

  v_org_ruta := app.uuid_o_null(v_partes[1]);
  v_ticket   := app.uuid_o_null(v_partes[2]);
  if v_org_ruta is null or v_ticket is null
     or v_partes[1] <> v_org_ruta::text
     or v_partes[2] <> v_ticket::text then
    return false;
  end if;

  -- Prefijo de los DOS primeros segmentos: el cupo es del TICKET, no de cada
  -- carpeta de visibilidad. Si contara por visibilidad, el mismo ticket
  -- admitiria 30 en 'publico' y 30 en 'interno'.
  v_prefijo := v_partes[1] || '/' || v_partes[2] || '/';

  -- Escape defensivo de los metacaracteres de LIKE (ver cabecera: con la forma
  -- canonica exigida arriba, ninguno de los tres puede aparecer).
  v_prefijo := pg_catalog.replace(v_prefijo, '\', '\');
  v_prefijo := pg_catalog.replace(v_prefijo, '%', '\%');
  v_prefijo := pg_catalog.replace(v_prefijo, '_', '\_');

  select pg_catalog.count(*)
    into v_usados
  from storage.objects o
  where o.bucket_id = 'ticket-attachments'
    and o.name like v_prefijo || '%';

  return v_usados < c_max;
end
$fn$;

comment on function app.hay_cupo_adjuntos_ticket(text) is
  'Tope de 30 objetos por ticket en el bucket ticket-attachments (docs/eng/08 §7: 5 adjuntos x 5 mensajes + margen). Vive en la BD y no en el Route Handler porque el INSERT del bucket es alcanzable directo con el JWT del cliente por la Storage API. Cuenta por el prefijo {org_id}/{ticket_id}/ sin mirar la visibilidad, y es SECURITY DEFINER para poder contar tambien los objetos internos que la sesion del cliente no ve. El rol operador queda exento: no existe ninguna via de borrado desde la app, asi que un tope duro lo dejaria bloqueado sin salida. Devuelve booleano en vez de lanzar excepcion para no filtrar el estado de un ticket ajeno segun el orden en que se evaluen los AND de la policy.';

revoke all on function app.hay_cupo_adjuntos_ticket(text) from public, anon;
grant execute on function app.hay_cupo_adjuntos_ticket(text)
  to authenticated, service_role;

-- ALTER POLICY y no DROP + CREATE: no deja ni una ventana de la transaccion
-- con la policy ausente, y no hay riesgo de recrearla con otro `to` o con un
-- `for` distinto por un error de tipeo.
--
-- El tope va SOLO en el INSERT. En el SELECT seria absurdo (y danino): quien
-- ya tiene 30 adjuntos subidos debe poder seguir leyendolos.
alter policy adjuntos_ticket_insert on storage.objects
  with check (bucket_id = 'ticket-attachments'
              and app.puede_tocar_adjunto_ticket(name)
              and app.hay_cupo_adjuntos_ticket(name));


-- ===========================================================================
-- 3. El comentario de mensajes_ticket.adjuntos documentaba la ruta vieja
--
--    Es solo un COMMENT, pero es el unico lugar del esquema donde esta escrita
--    la forma de `ruta`, y quien lo lea despues de este cambio armaria un path
--    de 2 segmentos que la policy va a rechazar. Se corrige.
--
--    No se agrega un CHECK que exija que la `ruta` guardada coincida con
--    es_interno: seria bonito, pero obliga a parsear jsonb en un CHECK sobre
--    una tabla ya auditada y aprobada, y el control que importa (que el
--    cliente no pueda DESCARGAR el objeto) ya lo hace la RLS del bucket. Si un
--    operador guardara una ruta 'interno' dentro de un mensaje publico, el
--    cliente veria el string de la ruta pero la descarga seguiria negada.
-- ===========================================================================
comment on column public.mensajes_ticket.adjuntos is
  'Arreglo JSON con los adjuntos del mensaje, maximo 5 (docs/eng/08 §7). Forma esperada: [{"ruta": "{org_id}/{ticket_id}/{publico|interno}/{uuid}-archivo.png", "nombre": "captura.png", "mime": "image/png", "tamano_bytes": 12345}]. El tercer segmento de `ruta` es la visibilidad y NO es decorativo: "interno" solo lo puede leer o escribir el operador (RLS de storage.objects), y debe coincidir con es_interno del mensaje. `ruta` apunta al objeto en el bucket ticket-attachments; el frontend nunca guarda una URL, siempre pide una firmada al backend.';
