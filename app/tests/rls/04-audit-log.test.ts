// Tarea 2.3 · audit_log: solo lectura del operador de su propia org,
// append-only para todos (incluido el dueño de la tabla / service_role).
//
// Verificado en vivo antes de escribir esto (importante para no adivinar
// los asserts): `authenticated` (cliente u operador) solo tiene GRANT SELECT
// sobre audit_log — un INSERT de cualquiera de los dos roles es
// "permission denied for table" (error de privilegios, ni siquiera llega a
// evaluarse una policy). En cambio UPDATE/DELETE SÍ tienen GRANT para
// postgres/service_role, pero las reglas `DO INSTEAD NOTHING` interceptan la
// reescritura de la consulta antes de tocar una fila: el resultado es
// "UPDATE 0" / "DELETE 0" sin excepción, para cualquier rol, incluido el
// dueño de la tabla. TRUNCATE sí tiene su propio trigger que aborta con
// excepción (errcode 0A000), incluso para postgres.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type TwoOrgFixtures, RlsTx, seedTwoOrgs } from "./helpers/db";

describe("audit_log: lectura restringida al operador de su propia org", () => {
  let tx: RlsTx;
  let f: TwoOrgFixtures;

  beforeEach(async () => {
    tx = await RlsTx.begin();
    f = await seedTwoOrgs(tx);
  });

  afterEach(async () => {
    await tx.rollback();
  });

  it("un cliente no lee NADA de audit_log, ni siquiera de su propia org", async () => {
    await tx.actAs(f.a.clienteAuthId);
    const res = await tx.query("select id from public.audit_log");
    expect(res.rowCount).toBe(0);

    const porId = await tx.query("select id from public.audit_log where id = $1", [
      f.a.auditLogId,
    ]);
    expect(porId.rowCount).toBe(0);
  });

  it("[camino feliz] el operador de Org A SÍ ve la entrada de auditoría de su propia org", async () => {
    await tx.actAs(f.a.operadorAuthId);
    const res = await tx.query("select id from public.audit_log where id = $1", [f.a.auditLogId]);
    expect(res.rowCount).toBe(1);
  });

  it("el operador de Org A no ve la entrada de auditoría de Org B", async () => {
    await tx.actAs(f.a.operadorAuthId);
    const listado = await tx.query("select id from public.audit_log");
    expect(listado.rows.map((r: any) => r.id)).not.toContain(f.b.auditLogId);

    const porId = await tx.query("select id from public.audit_log where id = $1", [
      f.b.auditLogId,
    ]);
    expect(porId.rowCount).toBe(0);
  });
});

describe("audit_log: append-only, ni el cliente ni el operador escriben directo", () => {
  let tx: RlsTx;
  let f: TwoOrgFixtures;

  beforeEach(async () => {
    tx = await RlsTx.begin();
    f = await seedTwoOrgs(tx);
  });

  afterEach(async () => {
    await tx.rollback();
  });

  it("un cliente no puede insertar en audit_log directamente (permission denied, sin GRANT de insert)", async () => {
    await tx.actAs(f.a.clienteAuthId);
    await expect(
      tx.query("insert into public.audit_log (org_id, accion) values ($1, 'suplantar auditoria')", [
        f.a.orgId,
      ]),
    ).rejects.toThrow(/permission denied/i);
  });

  it("un operador tampoco puede insertar en audit_log directamente (escribe solo el backend/service_role)", async () => {
    await tx.actAs(f.a.operadorAuthId);
    await expect(
      tx.query("insert into public.audit_log (org_id, accion) values ($1, 'suplantar auditoria')", [
        f.a.orgId,
      ]),
    ).rejects.toThrow(/permission denied/i);
  });
});

describe("audit_log: inmutable incluso para el dueño de la tabla (postgres/service_role)", () => {
  let tx: RlsTx;
  let f: TwoOrgFixtures;

  beforeEach(async () => {
    tx = await RlsTx.begin();
    f = await seedTwoOrgs(tx);
  });

  afterEach(async () => {
    await tx.rollback();
  });

  it("UPDATE directo sobre audit_log afecta 0 filas, sin lanzar excepción (regla DO INSTEAD NOTHING)", async () => {
    await tx.actAsPostgres();
    const res = await tx.query("update public.audit_log set accion = 'editado' where id = $1", [
      f.a.auditLogId,
    ]);
    expect(res.rowCount).toBe(0);

    const original = await tx.query("select accion from public.audit_log where id = $1", [
      f.a.auditLogId,
    ]);
    expect(original.rows[0].accion).toBe("test.fixture.creado");
  });

  it("DELETE directo sobre audit_log afecta 0 filas, sin lanzar excepción (regla DO INSTEAD NOTHING)", async () => {
    await tx.actAsPostgres();
    const res = await tx.query("delete from public.audit_log where id = $1", [f.a.auditLogId]);
    expect(res.rowCount).toBe(0);

    const sigueAhi = await tx.query("select id from public.audit_log where id = $1", [
      f.a.auditLogId,
    ]);
    expect(sigueAhi.rowCount).toBe(1);
  });

  it("TRUNCATE sobre audit_log está bloqueado incluso para postgres (trigger, errcode 0A000)", async () => {
    await tx.actAsPostgres();
    await expect(tx.query("truncate public.audit_log")).rejects.toMatchObject({
      code: "0A000",
    });
  });
});
