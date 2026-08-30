// Tarea 2.3 · Aislamiento cross-tenant: registros_uso, suscripciones, cobros.
//
// Nota de diseño (verificado en vivo antes de escribir estos tests, ver
// GRANTs de la migración inicial §9): `registros_uso` y `cobros` solo
// conceden SELECT a `authenticated` (los escribe el backend/Flow/webhooks).
// Un UPDATE ahí no es un "0 filas por RLS": Postgres nunca llega a evaluar
// la policy porque no hay privilegio de UPDATE — el error es
// "permission denied for table ...", distinto del caso RLS.
// `suscripciones` sí tiene policy de UPDATE, pero solo para el operador.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type TwoOrgFixtures, RlsTx, seedTwoOrgs } from "./helpers/db";

describe("aislamiento cross-tenant: registros_uso", () => {
  let tx: RlsTx;
  let f: TwoOrgFixtures;

  beforeEach(async () => {
    tx = await RlsTx.begin();
    f = await seedTwoOrgs(tx);
  });

  afterEach(async () => {
    await tx.rollback();
  });

  it("cliente de Org A no ve el registro de uso de Org B (listado ni por id)", async () => {
    await tx.actAs(f.a.clienteAuthId);
    const listado = await tx.query("select id from public.registros_uso");
    expect(listado.rows.map((r: any) => r.id)).not.toContain(f.b.registroUsoId);

    const porId = await tx.query("select id from public.registros_uso where id = $1", [
      f.b.registroUsoId,
    ]);
    expect(porId.rowCount).toBe(0);
  });

  it("[camino feliz] cliente de Org A SÍ ve su propio registro de uso", async () => {
    await tx.actAs(f.a.clienteAuthId);
    const res = await tx.query("select id from public.registros_uso where id = $1", [
      f.a.registroUsoId,
    ]);
    expect(res.rowCount).toBe(1);
  });

  it("registros_uso es de solo lectura para authenticated: UPDATE lanza permission denied (no hay GRANT)", async () => {
    await tx.actAs(f.a.clienteAuthId);
    await expect(
      tx.query("update public.registros_uso set modelo = 'otro' where id = $1", [
        f.a.registroUsoId,
      ]),
    ).rejects.toThrow(/permission denied/i);
  });
});

describe("aislamiento cross-tenant: suscripciones", () => {
  let tx: RlsTx;
  let f: TwoOrgFixtures;

  beforeEach(async () => {
    tx = await RlsTx.begin();
    f = await seedTwoOrgs(tx);
  });

  afterEach(async () => {
    await tx.rollback();
  });

  it("cliente de Org A no ve la suscripción de Org B (listado ni por id)", async () => {
    await tx.actAs(f.a.clienteAuthId);
    const listado = await tx.query("select id from public.suscripciones");
    expect(listado.rows.map((r: any) => r.id)).not.toContain(f.b.suscripcionId);

    const porId = await tx.query("select id from public.suscripciones where id = $1", [
      f.b.suscripcionId,
    ]);
    expect(porId.rowCount).toBe(0);
  });

  it("[camino feliz] cliente de Org A SÍ ve su propia suscripción", async () => {
    await tx.actAs(f.a.clienteAuthId);
    const res = await tx.query("select id from public.suscripciones where id = $1", [
      f.a.suscripcionId,
    ]);
    expect(res.rowCount).toBe(1);
  });

  it("operador de Org A no puede actualizar la suscripción de Org B (0 filas afectadas)", async () => {
    await tx.actAs(f.a.operadorAuthId);
    const res = await tx.query("update public.suscripciones set estado = 'cancelada' where id = $1", [
      f.b.suscripcionId,
    ]);
    expect(res.rowCount).toBe(0);
  });

  it("[camino feliz] operador de Org A SÍ puede actualizar la suscripción de su propia org", async () => {
    await tx.actAs(f.a.operadorAuthId);
    const res = await tx.query("update public.suscripciones set estado = 'pausada' where id = $1", [
      f.a.suscripcionId,
    ]);
    expect(res.rowCount).toBe(1);
  });
});

describe("aislamiento cross-tenant: cobros", () => {
  let tx: RlsTx;
  let f: TwoOrgFixtures;

  beforeEach(async () => {
    tx = await RlsTx.begin();
    f = await seedTwoOrgs(tx);
  });

  afterEach(async () => {
    await tx.rollback();
  });

  it("cliente de Org A no ve el cobro de Org B (listado ni por id)", async () => {
    await tx.actAs(f.a.clienteAuthId);
    const listado = await tx.query("select id from public.cobros");
    expect(listado.rows.map((r: any) => r.id)).not.toContain(f.b.cobroId);

    const porId = await tx.query("select id from public.cobros where id = $1", [f.b.cobroId]);
    expect(porId.rowCount).toBe(0);
  });

  it("operador de Org A no ve el cobro de Org B tampoco (cobros es solo lectura incluso para operador)", async () => {
    await tx.actAs(f.a.operadorAuthId);
    const res = await tx.query("select id from public.cobros where id = $1", [f.b.cobroId]);
    expect(res.rowCount).toBe(0);
  });

  it("[camino feliz] cliente y operador de Org A SÍ ven el cobro de su propia org", async () => {
    await tx.actAs(f.a.clienteAuthId);
    const comoCliente = await tx.query("select id from public.cobros where id = $1", [f.a.cobroId]);
    expect(comoCliente.rowCount).toBe(1);

    await tx.actAs(f.a.operadorAuthId);
    const comoOperador = await tx.query("select id from public.cobros where id = $1", [
      f.a.cobroId,
    ]);
    expect(comoOperador.rowCount).toBe(1);
  });

  it("cobros es de solo lectura incluso para el operador: UPDATE lanza permission denied (no hay GRANT)", async () => {
    await tx.actAs(f.a.operadorAuthId);
    await expect(
      tx.query("update public.cobros set estado = 'pagado' where id = $1", [f.a.cobroId]),
    ).rejects.toThrow(/permission denied/i);
  });
});
