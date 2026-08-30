// Tarea 7.3 · Límite mensual auto-declarado por el cliente.
//
// La columna `clientes.limite_mensual_clp` es un número que el CLIENTE declara
// (el tope que él mismo configuró en Anthropic/OpenAI). Kaudal solo lo compara
// contra el uso real para avisarle al 80%. No lo hace cumplir.
//
// Lo que se verifica acá es el candado, no la aritmética del aviso:
//   · el cliente escribe SU límite y nada más (RPC de columna única);
//   · no existe forma de alcanzar la fila de otro cliente (el RPC no acepta
//     cliente_id: la fila sale del JWT);
//   · el operador no entra por el RPC (tiene su propio camino, clientes_operador);
//   · `authenticated` sigue SIN policy de UPDATE para el cliente, así que el
//     UPDATE directo a la tabla no escribe aunque el GRANT exista;
//   · los errores salen en español, no como el CHECK crudo de Postgres.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type TwoOrgFixtures, RlsTx, seedTwoOrgs } from "./helpers/db";

describe("límite mensual del cliente: camino feliz", () => {
  let tx: RlsTx;
  let f: TwoOrgFixtures;

  beforeEach(async () => {
    tx = await RlsTx.begin();
    f = await seedTwoOrgs(tx);
  });

  afterEach(async () => {
    await tx.rollback();
  });

  it("nace en NULL: sin límite configurado no hay nada que advertir", async () => {
    await tx.actAs(f.a.clienteAuthId);
    const res = await tx.query("select limite_mensual_clp from public.clientes where id = $1", [
      f.a.clienteId,
    ]);
    expect(res.rowCount).toBe(1);
    expect(res.rows[0].limite_mensual_clp).toBeNull();
  });

  it("el cliente fija su límite y lo vuelve a leer con un select normal (clientes_self)", async () => {
    await tx.actAs(f.a.clienteAuthId);

    const rpc = await tx.query(
      "select limite_mensual_clp from public.actualizar_limite_mensual_cliente(500000)",
    );
    expect(rpc.rows[0].limite_mensual_clp).toBe("500000.00");

    const leido = await tx.query("select limite_mensual_clp from public.clientes where id = $1", [
      f.a.clienteId,
    ]);
    expect(leido.rows[0].limite_mensual_clp).toBe("500000.00");
  });

  it("el cliente puede borrar su límite (volver a NULL = sin configurar)", async () => {
    await tx.actAs(f.a.clienteAuthId);
    await tx.query("select public.actualizar_limite_mensual_cliente(500000)");

    await tx.query("select public.actualizar_limite_mensual_cliente(null)");
    const leido = await tx.query("select limite_mensual_clp from public.clientes where id = $1", [
      f.a.clienteId,
    ]);
    expect(leido.rows[0].limite_mensual_clp).toBeNull();

    await tx.query("select public.actualizar_limite_mensual_cliente(700000)");
    await tx.query("select public.actualizar_limite_mensual_cliente()");
    const tras = await tx.query("select limite_mensual_clp from public.clientes where id = $1", [
      f.a.clienteId,
    ]);
    expect(tras.rows[0].limite_mensual_clp).toBeNull();
  });

  it("0 es un límite válido y distinto de NULL", async () => {
    await tx.actAs(f.a.clienteAuthId);
    await tx.query("select public.actualizar_limite_mensual_cliente(0)");
    const leido = await tx.query("select limite_mensual_clp from public.clientes where id = $1", [
      f.a.clienteId,
    ]);
    expect(leido.rows[0].limite_mensual_clp).toBe("0.00");
  });

  it("el RPC escribe SOLO limite_mensual_clp: el resto de la fila queda intacto", async () => {
    await tx.actAsPostgres();
    const antes = await tx.query(
      "select razon_social, rut, estado, org_id, email, plan_default from public.clientes where id = $1",
      [f.a.clienteId],
    );

    await tx.actAs(f.a.clienteAuthId);
    await tx.query("select public.actualizar_limite_mensual_cliente(123456.78)");

    await tx.actAsPostgres();
    const despues = await tx.query(
      "select razon_social, rut, estado, org_id, email, plan_default, limite_mensual_clp from public.clientes where id = $1",
      [f.a.clienteId],
    );
    expect(despues.rows[0]).toMatchObject(antes.rows[0]);
    expect(despues.rows[0].limite_mensual_clp).toBe("123456.78");
  });

  it("[camino del operador] el operador edita la columna por UPDATE directo, pero solo en su org", async () => {
    await tx.actAs(f.a.operadorAuthId);
    const propio = await tx.query(
      "update public.clientes set limite_mensual_clp = 900000 where id = $1",
      [f.a.clienteId],
    );
    expect(propio.rowCount).toBe(1);

    const cruzado = await tx.query(
      "update public.clientes set limite_mensual_clp = 900000 where id = $1",
      [f.b.clienteId],
    );
    expect(cruzado.rowCount).toBe(0);
  });
});

describe("límite mensual del cliente: el candado", () => {
  let tx: RlsTx;
  let f: TwoOrgFixtures;

  beforeEach(async () => {
    tx = await RlsTx.begin();
    f = await seedTwoOrgs(tx);
  });

  afterEach(async () => {
    await tx.rollback();
  });

  it("el RPC no expone ningún parámetro de cliente: su única entrada es el monto", async () => {
    await tx.actAsPostgres();
    const firma = await tx.query<{ args: string; prosecdef: boolean; proconfig: string[] }>(
      "select pg_get_function_identity_arguments(p.oid) as args, p.prosecdef, p.proconfig" +
        " from pg_proc p join pg_namespace n on n.oid = p.pronamespace" +
        " where n.nspname = 'public' and p.proname = 'actualizar_limite_mensual_cliente'",
    );
    expect(firma.rowCount).toBe(1);
    expect(firma.rows[0].args).toBe("p_monto numeric");
    expect(firma.rows[0].prosecdef).toBe(true);
    expect(firma.rows[0].proconfig).toContain('search_path=""');
  });

  it("el cliente de Org A no puede tocar el límite del cliente de Org B", async () => {
    await tx.actAsPostgres();
    await tx.query("update public.clientes set limite_mensual_clp = 111111 where id = $1", [
      f.b.clienteId,
    ]);

    await tx.actAs(f.a.clienteAuthId);

    await tx.query("select public.actualizar_limite_mensual_cliente(999999)");

    const sobrecarga = await tx.queryExpectingError(
      "select public.actualizar_limite_mensual_cliente($1, 999999)",
      [f.b.clienteId],
    );
    expect(sobrecarga.code).toBe("42883");

    const directo = await tx.query(
      "update public.clientes set limite_mensual_clp = 999999 where id = $1",
      [f.b.clienteId],
    );
    expect(directo.rowCount).toBe(0);

    await tx.actAsPostgres();
    const b = await tx.query("select limite_mensual_clp from public.clientes where id = $1", [
      f.b.clienteId,
    ]);
    expect(b.rows[0].limite_mensual_clp).toBe("111111.00");

    const a = await tx.query("select limite_mensual_clp from public.clientes where id = $1", [
      f.a.clienteId,
    ]);
    expect(a.rows[0].limite_mensual_clp).toBe("999999.00");
  });

  it("el cliente NO puede cambiar su límite con un UPDATE directo (no hay policy de UPDATE self)", async () => {
    await tx.actAs(f.a.clienteAuthId);
    const res = await tx.query(
      "update public.clientes set limite_mensual_clp = 777777 where id = $1",
      [f.a.clienteId],
    );
    expect(res.rowCount).toBe(0);

    await tx.actAsPostgres();
    const check = await tx.query("select limite_mensual_clp from public.clientes where id = $1", [
      f.a.clienteId,
    ]);
    expect(check.rows[0].limite_mensual_clp).toBeNull();
  });

  it("la única policy de escritura sobre clientes sigue siendo la del operador", async () => {
    await tx.actAsPostgres();
    const policies = await tx.query<{ policyname: string; cmd: string }>(
      "select policyname, cmd from pg_policies" +
        " where schemaname = 'public' and tablename = 'clientes' order by policyname",
    );
    const escritura = policies.rows.filter((p) => p.cmd !== "SELECT");
    expect(escritura.map((p) => p.policyname)).toEqual(["clientes_operador"]);
  });

  it("el operador es rechazado al llamar el RPC (mismo criterio que actualizar_mi_perfil)", async () => {
    await tx.actAs(f.a.operadorAuthId);
    const err = await tx.queryExpectingError(
      "select public.actualizar_limite_mensual_cliente(500000)",
    );
    expect(err.code).toBe("42501");
    expect(err.message).toContain("No tienes permiso");
  });

  it("anon (sin sesión) no puede ejecutar el RPC", async () => {
    await tx.actAsAnon();
    const err = await tx.queryExpectingError(
      "select public.actualizar_limite_mensual_cliente(500000)",
    );
    expect(err.code).toBe("42501");
  });

  it("un monto negativo se rechaza con mensaje en español, no con el CHECK crudo", async () => {
    await tx.actAs(f.a.clienteAuthId);
    const err = await tx.queryExpectingError(
      "select public.actualizar_limite_mensual_cliente(-100)",
    );
    expect(err.code).toBe("22023");
    expect(err.message).toBe("El limite mensual no puede ser negativo.");
    expect(err.message).not.toContain("chk_clientes_limite_mensual");
  });

  it("un monto absurdo se rechaza en español, no con numeric field overflow", async () => {
    await tx.actAs(f.a.clienteAuthId);
    const err = await tx.queryExpectingError(
      "select public.actualizar_limite_mensual_cliente(99999999999999)",
    );
    expect(err.code).toBe("22023");
    expect(err.message).toContain("demasiado alto");
  });

  it("el CHECK de la tabla sostiene el piso aunque se escriba por fuera del RPC", async () => {
    await tx.actAsPostgres();
    const err = await tx.queryExpectingError(
      "update public.clientes set limite_mensual_clp = -1 where id = $1",
      [f.a.clienteId],
    );
    expect(err.code).toBe("23514");
    expect(err.message).toContain("chk_clientes_limite_mensual");
  });
});
