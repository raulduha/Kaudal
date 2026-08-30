// Tarea 2.3 · tickets_reclamos, mensajes_ticket (incluida `es_interno`) y el
// RPC `cambiar_estado_mi_ticket`.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type TwoOrgFixtures, RlsTx, seedTwoOrgs } from "./helpers/db";

describe("aislamiento cross-tenant: tickets_reclamos", () => {
  let tx: RlsTx;
  let f: TwoOrgFixtures;

  beforeEach(async () => {
    tx = await RlsTx.begin();
    f = await seedTwoOrgs(tx);
  });

  afterEach(async () => {
    await tx.rollback();
  });

  it("cliente de Org A no ve el ticket de Org B (listado ni por id)", async () => {
    await tx.actAs(f.a.clienteAuthId);
    const listado = await tx.query("select id from public.tickets_reclamos");
    expect(listado.rows.map((r: any) => r.id)).not.toContain(f.b.ticketId);

    const porId = await tx.query("select id from public.tickets_reclamos where id = $1", [
      f.b.ticketId,
    ]);
    expect(porId.rowCount).toBe(0);
  });

  it("[camino feliz] cliente de Org A SÍ ve su propio ticket", async () => {
    await tx.actAs(f.a.clienteAuthId);
    const res = await tx.query("select id, asunto from public.tickets_reclamos where id = $1", [
      f.a.ticketId,
    ]);
    expect(res.rowCount).toBe(1);
  });

  it("cliente de Org A no puede crear un ticket suplantando a Org B (WITH CHECK lo rechaza con excepción)", async () => {
    await tx.actAs(f.a.clienteAuthId);
    await expect(
      tx.query(
        `insert into public.tickets_reclamos (org_id, cliente_id, abierto_por, asunto)
         values ($1, $2, $3, 'ticket falso para B')`,
        [f.b.orgId, f.b.clienteId, f.a.clienteUsuarioId],
      ),
    ).rejects.toThrow(/row-level security policy/i);
  });

  it("operador de Org A no ve ni puede actualizar el ticket de Org B", async () => {
    await tx.actAs(f.a.operadorAuthId);
    const select = await tx.query("select id from public.tickets_reclamos where id = $1", [
      f.b.ticketId,
    ]);
    expect(select.rowCount).toBe(0);

    const update = await tx.query(
      "update public.tickets_reclamos set prioridad = 'alta' where id = $1",
      [f.b.ticketId],
    );
    expect(update.rowCount).toBe(0);
  });

  it("[camino feliz] operador de Org A SÍ puede actualizar el ticket de su propia org", async () => {
    await tx.actAs(f.a.operadorAuthId);
    const res = await tx.query(
      "update public.tickets_reclamos set prioridad = 'alta' where id = $1",
      [f.a.ticketId],
    );
    expect(res.rowCount).toBe(1);
  });
});

describe("mensajes_ticket: notas internas nunca visibles para el cliente", () => {
  let tx: RlsTx;
  let f: TwoOrgFixtures;

  beforeEach(async () => {
    tx = await RlsTx.begin();
    f = await seedTwoOrgs(tx);
  });

  afterEach(async () => {
    await tx.rollback();
  });

  it("cliente ve el mensaje público de SU ticket pero nunca el interno, aunque sea el mismo ticket", async () => {
    await tx.actAs(f.a.clienteAuthId);
    const res = await tx.query(
      "select id, es_interno from public.mensajes_ticket where ticket_id = $1 order by created_at",
      [f.a.ticketId],
    );
    expect(res.rowCount).toBe(1);
    expect(res.rows[0].id).toBe(f.a.mensajePublicoId);
    expect(res.rows[0].es_interno).toBe(false);

    const soloInterno = await tx.query("select id from public.mensajes_ticket where id = $1", [
      f.a.mensajeInternoId,
    ]);
    expect(soloInterno.rowCount).toBe(0);
  });

  it("[camino feliz] el operador SÍ ve ambos mensajes (público e interno) del ticket de su org", async () => {
    await tx.actAs(f.a.operadorAuthId);
    const res = await tx.query(
      "select id, es_interno from public.mensajes_ticket where ticket_id = $1",
      [f.a.ticketId],
    );
    expect(res.rowCount).toBe(2);
    const ids = res.rows.map((r: any) => r.id);
    expect(ids).toContain(f.a.mensajePublicoId);
    expect(ids).toContain(f.a.mensajeInternoId);
  });

  it("el cliente no puede insertar un mensaje marcado como nota interna en su propio ticket", async () => {
    await tx.actAs(f.a.clienteAuthId);
    await expect(
      tx.query(
        `insert into public.mensajes_ticket (org_id, ticket_id, autor_id, autor_rol, cuerpo, es_interno)
         values ($1, $2, $3, 'cliente', 'intento de nota interna', true)`,
        [f.a.orgId, f.a.ticketId, f.a.clienteUsuarioId],
      ),
    ).rejects.toThrow(/row-level security policy/i);
  });

  it("cliente de Org A no ve ningún mensaje del ticket de Org B (ni público)", async () => {
    await tx.actAs(f.a.clienteAuthId);
    const res = await tx.query("select id from public.mensajes_ticket where ticket_id = $1", [
      f.b.ticketId,
    ]);
    expect(res.rowCount).toBe(0);
  });
});

describe("RPC cambiar_estado_mi_ticket", () => {
  let tx: RlsTx;
  let f: TwoOrgFixtures;

  beforeEach(async () => {
    tx = await RlsTx.begin();
    f = await seedTwoOrgs(tx);
  });

  afterEach(async () => {
    await tx.rollback();
  });

  it("[camino feliz] el cliente puede cerrar y luego reabrir SU propio ticket", async () => {
    await tx.actAs(f.a.clienteAuthId);

    const cerrado = await tx.query(
      "select * from public.cambiar_estado_mi_ticket($1, 'cerrado')",
      [f.a.ticketId],
    );
    expect(cerrado.rows[0].estado).toBe("cerrado");
    expect(cerrado.rows[0].cerrado_en).not.toBeNull();

    const reabierto = await tx.query(
      "select * from public.cambiar_estado_mi_ticket($1, 'abierto')",
      [f.a.ticketId],
    );
    expect(reabierto.rows[0].estado).toBe("abierto");
    expect(reabierto.rows[0].cerrado_en).toBeNull();
  });

  it("el cliente de Org A no puede cambiar el estado de un ticket de Org B: excepción genérica, sin filtrar existencia", async () => {
    await tx.actAs(f.a.clienteAuthId);

    const err = await tx.queryExpectingError(
      "select * from public.cambiar_estado_mi_ticket($1, 'cerrado')",
      [f.b.ticketId],
    );
    expect(err.message).toMatch(/No encontramos ese ticket/i);

    // El ticket de B no cambió de estado (verificado como postgres).
    await tx.actAsPostgres();
    const check = await tx.query("select estado from public.tickets_reclamos where id = $1", [
      f.b.ticketId,
    ]);
    expect(check.rows[0].estado).toBe("abierto");
  });

  it("el mismo mensaje de error genérico se usa exista o no exista el ticket (no filtra información)", async () => {
    await tx.actAs(f.a.clienteAuthId);
    const idInexistente = "00000000-0000-0000-0000-000000000000";

    const errorAjeno = await tx.queryExpectingError(
      "select * from public.cambiar_estado_mi_ticket($1, 'cerrado')",
      [f.b.ticketId],
    );
    const errorInexistente = await tx.queryExpectingError(
      "select * from public.cambiar_estado_mi_ticket($1, 'cerrado')",
      [idInexistente],
    );

    expect(errorAjeno.message).toBe(errorInexistente.message);
    expect(errorAjeno.message).toMatch(/No encontramos ese ticket/i);
  });
});
