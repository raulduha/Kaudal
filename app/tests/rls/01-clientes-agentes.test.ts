// Tarea 2.3 · Aislamiento cross-tenant: clientes y agentes.
//
// `clientes`/`agentes` solo tienen policy de UPDATE para el rol operador
// ("for all ... using(org_id = current_org_id() and rol = 'operador')").
// El rol cliente nunca tiene policy de UPDATE en ninguna tabla (todas sus
// escrituras van por RPC), así que las pruebas de UPDATE cross-tenant las
// hacemos con el operador, que es el caso donde SÍ existe una policy que
// podría (si hubiera un bug) dejar pasar una fila de otra org.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type TwoOrgFixtures, RlsTx, seedTwoOrgs } from "./helpers/db";

describe("aislamiento cross-tenant: clientes", () => {
  let tx: RlsTx;
  let f: TwoOrgFixtures;

  beforeEach(async () => {
    tx = await RlsTx.begin();
    f = await seedTwoOrgs(tx);
  });

  afterEach(async () => {
    await tx.rollback();
  });

  it("cliente de Org A no ve la fila de clientes de Org B en el listado", async () => {
    await tx.actAs(f.a.clienteAuthId);
    const res = await tx.query("select id from public.clientes");
    const ids = res.rows.map((r: any) => r.id);
    expect(ids).not.toContain(f.b.clienteId);
  });

  it("cliente de Org A no ve la fila de clientes de Org B por id directo (0 filas, sin error)", async () => {
    await tx.actAs(f.a.clienteAuthId);
    const res = await tx.query("select id from public.clientes where id = $1", [f.b.clienteId]);
    expect(res.rowCount).toBe(0);
  });

  it("[camino feliz] cliente de Org A SÍ ve su propia fila de clientes", async () => {
    await tx.actAs(f.a.clienteAuthId);
    const res = await tx.query("select id, razon_social from public.clientes where id = $1", [
      f.a.clienteId,
    ]);
    expect(res.rowCount).toBe(1);
    expect(res.rows[0].id).toBe(f.a.clienteId);
  });

  it("operador de Org A no puede actualizar la fila de clientes de Org B (0 filas afectadas, sin error)", async () => {
    await tx.actAs(f.a.operadorAuthId);
    const res = await tx.query(
      "update public.clientes set razon_social = 'hackeado' where id = $1",
      [f.b.clienteId],
    );
    expect(res.rowCount).toBe(0);

    // Confirmamos que la fila de B sigue intacta (como postgres, bypass RLS).
    await tx.actAsPostgres();
    const check = await tx.query("select razon_social from public.clientes where id = $1", [
      f.b.clienteId,
    ]);
    expect(check.rows[0].razon_social).not.toBe("hackeado");
  });

  it("[camino feliz] operador de Org A SÍ puede actualizar la fila de clientes de su propia org", async () => {
    await tx.actAs(f.a.operadorAuthId);
    const res = await tx.query(
      "update public.clientes set razon_social = 'renombrado ok' where id = $1",
      [f.a.clienteId],
    );
    expect(res.rowCount).toBe(1);
  });
});

describe("aislamiento cross-tenant: agentes", () => {
  let tx: RlsTx;
  let f: TwoOrgFixtures;

  beforeEach(async () => {
    tx = await RlsTx.begin();
    f = await seedTwoOrgs(tx);
  });

  afterEach(async () => {
    await tx.rollback();
  });

  it("cliente de Org A no ve el agente de Org B (listado ni por id)", async () => {
    await tx.actAs(f.a.clienteAuthId);
    const listado = await tx.query("select id from public.agentes");
    expect(listado.rows.map((r: any) => r.id)).not.toContain(f.b.agenteId);

    const porId = await tx.query("select id from public.agentes where id = $1", [f.b.agenteId]);
    expect(porId.rowCount).toBe(0);
  });

  it("[camino feliz] cliente de Org A SÍ ve su propio agente", async () => {
    await tx.actAs(f.a.clienteAuthId);
    const res = await tx.query("select id, nombre from public.agentes where id = $1", [
      f.a.agenteId,
    ]);
    expect(res.rowCount).toBe(1);
  });

  it("operador de Org A no puede actualizar el agente de Org B (0 filas afectadas)", async () => {
    await tx.actAs(f.a.operadorAuthId);
    const res = await tx.query("update public.agentes set estado = 'pausado' where id = $1", [
      f.b.agenteId,
    ]);
    expect(res.rowCount).toBe(0);
  });

  it("[camino feliz] operador de Org A SÍ puede actualizar el agente de su propia org", async () => {
    await tx.actAs(f.a.operadorAuthId);
    const res = await tx.query("update public.agentes set estado = 'pausado' where id = $1", [
      f.a.agenteId,
    ]);
    expect(res.rowCount).toBe(1);
  });
});
