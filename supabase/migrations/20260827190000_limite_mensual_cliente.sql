-- ============================================================================
-- Kaudal · Limite mensual AUTO-DECLARADO por el cliente (Tarea 7.3)
-- Fuente: docs/18-definicion-producto.md §10 ("los limites que EL configuro en
--         su API key ... y una advertencia cuando se acerque al tope"),
--         docs/eng/06-portal-cliente.md §4 ("Donde se usa").
--
-- QUE ES Y QUE NO ES
--   Es un numero que el CLIENTE declara: el tope de gasto que el mismo dejo
--   configurado alla en su proveedor (Anthropic/OpenAI). Kaudal solo lo guarda
--   para compararlo contra el uso real y avisarle "vas en el 80% de tu limite
--   mensual". NO es un tope que Kaudal haga cumplir: ningun agente se corta ni
--   se bloquea por esta columna. Es informativo.
--   NULL = el cliente no configuro nada -> el portal no muestra advertencia.
--
-- POR QUE UN RPC Y NO UNA POLICY DE UPDATE
--   `clientes_self` (20260826125600 §7.2) es SOLO `for select`: hoy el cliente
--   no puede escribir NADA en su propia fila de `clientes`. Es la misma
--   decision que se tomo para `usuarios` en 20260826141500 (hallazgo H3): RLS
--   filtra FILAS, no COLUMNAS, asi que una policy de UPDATE self abriria la
--   fila entera —razon_social, rut, giro, direccion, email, estado,
--   plan_default, deleted_at— a reescritura por el propio cliente. Se repite
--   el patron de `public.actualizar_mi_perfil(text)`: un RPC de columna unica.
--
-- SIN CAMBIOS EN RLS NI EN GRANTS DE TABLA
--   - `clientes_operador` es `for all` sin restriccion de columna: el operador
--     ve y edita `limite_mensual_clp` desde el dia uno, sin tocar nada.
--   - `clientes_self` es `for select`: el cliente LEE su limite con un select
--     normal, sin RPC.
--   - `authenticated` ya tiene `grant select, insert, update on public.clientes`
--     (20260826125600 §9), pero eso es inerte para el cliente: sin policy de
--     UPDATE que lo habilite, el UPDATE directo devuelve 0 filas. El grant solo
--     lo usa el operador, que si tiene policy. Se verifica en las pruebas.
--   - No hay GRANT por columna (a diferencia de la Fase 6, donde `api_keys_*`
--     guardaba material cifrado): esto es un monto en CLP, no un secreto.
--
-- INDICES
--   Ninguno nuevo. El unico patron de lectura es "mi fila" (PK) y el listado
--   del operador (ya cubierto por idx_clientes_org / idx_clientes_org_estado).
--   Un indice sobre un numeric que nunca es predicado de filtro solo costaria
--   escrituras.
--
-- Rollback: supabase/rollbacks/20260827190000_limite_mensual_cliente_down.sql
-- Reversible. No toca ni una fila existente: la columna nace NULL en todas.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. La columna
--    numeric(14,2): montos en CLP. Sin decimales en la practica, pero el tipo
--    los tolera por si el proveedor declara el tope en USD convertido.
--    Nullable A PROPOSITO: NULL y 0 significan cosas distintas.
--      NULL = "no configure limite"  -> el portal no muestra advertencia.
--      0    = "mi limite es cero"    -> valido, y el portal avisa de inmediato.
-- ---------------------------------------------------------------------------
alter table public.clientes
  add column limite_mensual_clp numeric(14,2);

alter table public.clientes
  add constraint chk_clientes_limite_mensual
  check (limite_mensual_clp is null or limite_mensual_clp >= 0);

comment on column public.clientes.limite_mensual_clp is
  'Tope de gasto mensual en CLP que el CLIENTE declara haber configurado en su proveedor (Anthropic/OpenAI). Informativo: Kaudal lo compara contra el uso real para avisar al 80%, pero NO lo hace cumplir ni corta ningun agente. NULL = sin limite configurado (no se muestra advertencia); 0 es un valor valido y distinto de NULL. Lo escribe el cliente via public.actualizar_limite_mensual_cliente(numeric) o el operador via clientes_operador.';

-- ---------------------------------------------------------------------------
-- 2. RPC: el cliente fija (o borra) SU limite
--    Mismo molde que public.actualizar_mi_perfil(text):
--      · SECURITY DEFINER + `set search_path = ''` (todo calificado a mano, sin
--        depender del search_path del que llama).
--      · La fila objetivo NO viene del payload: sale de app.current_cliente_id()
--        + app.current_org_id(), que leen el JWT de la sesion. No existe
--        parametro de cliente_id, asi que no hay nada que manipular para
--        alcanzar la fila de otro cliente.
--      · Exige rol 'cliente': el operador tiene su propio camino (UPDATE
--        directo bajo clientes_operador) y no debe entrar por aca, igual que
--        cambiar_estado_mi_ticket.
--      · Escribe UNA sola columna. Nunca razon_social, rut, estado ni org_id.
--
--    p_monto NULL es LEGITIMO y significa "borrar el limite" (volver a "sin
--    configurar"). Por eso el parametro tiene default NULL y la validacion de
--    rango solo corre cuando NO es NULL.
-- ---------------------------------------------------------------------------
create or replace function public.actualizar_limite_mensual_cliente(
  p_monto numeric default null
) returns public.clientes
language plpgsql security definer set search_path = '' as $$
declare
  v_org     uuid := app.current_org_id();
  v_cliente uuid := app.current_cliente_id();
  v_rol     text := app.current_rol();
  v_fila    public.clientes;
begin
  if v_rol is distinct from 'cliente' or v_org is null or v_cliente is null then
    raise exception 'No tienes permiso para cambiar el limite mensual.'
      using errcode = '42501';
  end if;

  -- Validacion propia ANTES del CHECK de la tabla: el CHECK igual atajaria el
  -- negativo, pero con un error crudo de Postgres ("viola la restriccion
  -- chk_clientes_limite_mensual") que no se le puede mostrar a una PYME.
  if p_monto is not null and p_monto < 0 then
    raise exception 'El limite mensual no puede ser negativo.'
      using errcode = '22023';
  end if;

  -- Misma logica para el tope del tipo numeric(14,2): sin esto, un monto
  -- absurdo revienta con "numeric field overflow" en ingles.
  if p_monto is not null and p_monto >= 1000000000000 then
    raise exception 'Ese limite mensual es demasiado alto. Revisa el monto.'
      using errcode = '22023';
  end if;

  update public.clientes c
     set limite_mensual_clp = p_monto
   where c.id = v_cliente
     and c.org_id = v_org
  returning c.* into v_fila;

  if not found then
    raise exception 'No encontramos tu cuenta.' using errcode = '42501';
  end if;

  return v_fila;
end $$;

comment on function public.actualizar_limite_mensual_cliente(numeric) is
  'Unica escritura que un cliente puede hacer sobre su propia fila de clientes: fija o borra (NULL) limite_mensual_clp, el tope que el mismo declara tener configurado en su proveedor. La fila se resuelve con app.current_cliente_id()/app.current_org_id(), nunca con un parametro. Jamas toca razon_social, rut, estado, org_id ni ninguna otra columna.';

revoke all on function public.actualizar_limite_mensual_cliente(numeric) from public, anon;
grant execute on function public.actualizar_limite_mensual_cliente(numeric)
  to authenticated, service_role;
