import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { closePool, RlsTx, seedTwoOrgs, type TwoOrgFixtures } from "./helpers/db";

describe("auditoría transversal de acciones sensibles (tarea 6.3)", () => {
  let tx: RlsTx;
  let f: TwoOrgFixtures;

  beforeEach(async () => {
    tx = await RlsTx.begin();
    f = await seedTwoOrgs(tx);
  });

  afterEach(async () => {
    await tx.rollback();
  });

  afterAll(async () => {
    await closePool();
  });

  it("registra el alta y cambio de estado de un agente con el actor de la sesión", async () => {
    await tx.actAs(f.a.operadorAuthId);
    const agente = await tx.query<{ id: string }>(
      `insert into public.agentes (org_id, cliente_id, nombre, tipo, metodo_reporte)
       values ($1, $2, 'Agente auditado', 'n8n', 'estimado') returning id`,
      [f.a.orgId, f.a.clienteId],
    );
    await tx.query("update public.agentes set estado = 'pausado' where id = $1", [agente.rows[0].id]);

    await tx.actAsPostgres();
    const logs = await tx.query<{ accion: string; actor_id: string; actor_rol: string; datos: unknown }>(
      `select accion, actor_id, actor_rol, datos from public.audit_log
       where entidad = 'agentes' and entidad_id = $1`,
      [agente.rows[0].id],
    );

    expect(logs.rows).toHaveLength(2);
    const alta = logs.rows.find((log) => log.accion === "agente.alta");
    const cambio = logs.rows.find((log) => log.accion === "agente.cambio_estado");
    expect(alta).toMatchObject({ actor_id: f.a.operadorUsuarioId, actor_rol: "operador" });
    expect(alta?.datos).toMatchObject({ cliente_id: f.a.clienteId, tipo: "n8n" });
    expect(cambio?.datos).toMatchObject({ antes: "activo", despues: "pausado" });
  });

  it("no agrega ruido cuando un cambio no es parte del ciclo de vida", async () => {
    await tx.actAs(f.a.operadorAuthId);
    await tx.query("update public.agentes set nombre = 'Solo cambió el nombre' where id = $1", [f.a.agenteId]);

    await tx.actAsPostgres();
    const logs = await tx.query<{ cantidad: number }>(
      `select count(*)::int as cantidad from public.audit_log
       where entidad = 'agentes' and entidad_id = $1 and accion = 'agente.cambio_estado'`,
      [f.a.agenteId],
    );
    expect(logs.rows[0].cantidad).toBe(0);
  });

  it("audita cambios de pago y DTE como acciones del sistema", async () => {
    await tx.actAsPostgres();
    await tx.query("update public.cobros set estado = 'pagado', pagado_en = now() where id = $1", [f.a.cobroId]);
    await tx.query(
      "update public.cobros set dte_estado = 'emitido', dte_tipo = 'boleta', dte_folio = '42' where id = $1",
      [f.a.cobroId],
    );

    const logs = await tx.query<{ accion: string; actor_rol: string; datos: unknown }>(
      `select accion, actor_rol, datos from public.audit_log
       where entidad = 'cobros' and entidad_id = $1 and accion like 'cobro.cambio_%'
       `,
      [f.a.cobroId],
    );
    expect(logs.rows.map((log) => log.accion).sort()).toEqual(["cobro.cambio_dte", "cobro.cambio_estado"]);
    expect(logs.rows.every((log) => log.actor_rol === "sistema")).toBe(true);
    expect(logs.rows.find((log) => log.accion === "cobro.cambio_dte")?.datos).toMatchObject({ antes: "no_emitido", despues: "emitido" });
  });
});
