import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RlsTx, seedTwoOrgs, type TwoOrgFixtures } from "./helpers/db";

describe("instancias: gating por suscripción", () => {
  let tx: RlsTx; let f: TwoOrgFixtures;
  beforeEach(async () => { tx = await RlsTx.begin(); f = await seedTwoOrgs(tx); });
  afterEach(async () => { await tx.rollback(); });

  it("no permite activar sin cobertura de instancia", async () => {
    await tx.actAsPostgres();
    const error = await tx.queryExpectingError(
      `insert into public.instancias (org_id, cliente_id, suscripcion_id, estado)
       values ($1, $2, $3, 'activa')`, [f.a.orgId, f.a.clienteId, f.a.suscripcionId],
    );
    expect(error.message).toMatch(/instancia sin una suscrip/i);
  });

  it("permite activar una suscripción vigente que sí cubre la instancia", async () => {
    await tx.actAsPostgres();
    await tx.query("update public.suscripciones set cubre_instancia = true where id = $1", [f.a.suscripcionId]);
    const instancia = await tx.query<{ estado: string }>(
      `insert into public.instancias (org_id, cliente_id, suscripcion_id, estado)
       values ($1, $2, $3, 'activa') returning estado`, [f.a.orgId, f.a.clienteId, f.a.suscripcionId],
    );
    expect(instancia.rows[0].estado).toBe("activa");
  });
});
