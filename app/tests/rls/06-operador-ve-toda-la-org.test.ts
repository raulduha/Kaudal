// Tarea 2.3 · Ítem 7 del encargo: confirmar que el operador ve TODO lo de
// su propia org (no solo los datos de un cliente en particular), mientras
// que cada usuario cliente sigue acotado a su propio `cliente_id` dentro de
// la MISMA org. La fixture de dos-orgs (helpers/db.ts) solo trae un cliente
// por org, así que acá agregamos un segundo cliente dentro de Org A para
// distinguir "aislamiento por org" (ya cubierto en los otros archivos) de
// "aislamiento por cliente dentro de la misma org".

import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DOMINIO_TEST, MARCA_TEST, RlsTx, type TwoOrgFixtures, seedTwoOrgs } from "./helpers/db";

interface SegundoClienteFixture {
  clienteId: string;
  usuarioAuthId: string;
  usuarioId: string;
  agenteId: string;
  ticketId: string;
}

async function seedSegundoClienteEnOrgA(
  tx: RlsTx,
  orgId: string,
): Promise<SegundoClienteFixture> {
  const suffix = randomUUID().slice(0, 8);

  const cliente = await tx.query<{ id: string }>(
    `insert into public.clientes (org_id, razon_social, email)
     values ($1, $2, $3) returning id`,
    [orgId, `${MARCA_TEST} Cliente A2 ${suffix}`, `cliente-a2-${suffix}@${DOMINIO_TEST}`],
  );
  const clienteId = cliente.rows[0].id;

  const usuarioAuthId = randomUUID();
  await tx.query(
    `insert into auth.users
       (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
     values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2,
             '{}'::jsonb, '{}'::jsonb, now(), now())`,
    [usuarioAuthId, `auth-cliente-a2-${suffix}@${DOMINIO_TEST}`],
  );

  const usuario = await tx.query<{ id: string }>(
    `insert into public.usuarios (org_id, cliente_id, auth_user_id, rol, nombre, email)
     values ($1, $2, $3, 'cliente', 'Usuario Cliente A2', $4) returning id`,
    [orgId, clienteId, usuarioAuthId, `usuario-cliente-a2-${suffix}@${DOMINIO_TEST}`],
  );
  const usuarioId = usuario.rows[0].id;

  const agente = await tx.query<{ id: string }>(
    `insert into public.agentes (org_id, cliente_id, nombre)
     values ($1, $2, $3) returning id`,
    [orgId, clienteId, `${MARCA_TEST} Agente A2 ${suffix}`],
  );
  const agenteId = agente.rows[0].id;

  const ticket = await tx.query<{ id: string }>(
    `insert into public.tickets_reclamos (org_id, cliente_id, abierto_por, asunto)
     values ($1, $2, $3, $4) returning id`,
    [orgId, clienteId, usuarioId, `${MARCA_TEST} Duda de A2`],
  );
  const ticketId = ticket.rows[0].id;

  return { clienteId, usuarioAuthId, usuarioId, agenteId, ticketId };
}

describe("operador ve toda la org (no solo un cliente); cada cliente ve solo lo suyo", () => {
  let tx: RlsTx;
  let f: TwoOrgFixtures;
  let a2: SegundoClienteFixture;

  beforeEach(async () => {
    tx = await RlsTx.begin();
    f = await seedTwoOrgs(tx); // ya está como postgres acá
    a2 = await seedSegundoClienteEnOrgA(tx, f.a.orgId);
  });

  afterEach(async () => {
    await tx.rollback();
  });

  it("[camino feliz] el operador de Org A ve clientes, agentes y tickets de AMBOS clientes (A1 y A2)", async () => {
    await tx.actAs(f.a.operadorAuthId);

    const clientes = await tx.query("select id from public.clientes");
    const clienteIds = clientes.rows.map((r: any) => r.id);
    expect(clienteIds).toContain(f.a.clienteId);
    expect(clienteIds).toContain(a2.clienteId);

    const agentes = await tx.query("select id from public.agentes");
    const agenteIds = agentes.rows.map((r: any) => r.id);
    expect(agenteIds).toContain(f.a.agenteId);
    expect(agenteIds).toContain(a2.agenteId);

    const tickets = await tx.query("select id from public.tickets_reclamos");
    const ticketIds = tickets.rows.map((r: any) => r.id);
    expect(ticketIds).toContain(f.a.ticketId);
    expect(ticketIds).toContain(a2.ticketId);
  });

  it("el usuario cliente de A1 NO ve nada del cliente A2, aunque sean de la MISMA org", async () => {
    await tx.actAs(f.a.clienteAuthId); // usuario cliente atado a f.a.clienteId (A1)

    const cliente = await tx.query("select id from public.clientes where id = $1", [
      a2.clienteId,
    ]);
    expect(cliente.rowCount).toBe(0);

    const agente = await tx.query("select id from public.agentes where id = $1", [a2.agenteId]);
    expect(agente.rowCount).toBe(0);

    const ticket = await tx.query("select id from public.tickets_reclamos where id = $1", [
      a2.ticketId,
    ]);
    expect(ticket.rowCount).toBe(0);
  });

  it("el usuario cliente de A2 NO ve nada del cliente A1, tampoco de Org B", async () => {
    await tx.actAs(a2.usuarioAuthId);

    const clienteA1 = await tx.query("select id from public.clientes where id = $1", [
      f.a.clienteId,
    ]);
    expect(clienteA1.rowCount).toBe(0);

    const clienteB = await tx.query("select id from public.clientes where id = $1", [
      f.b.clienteId,
    ]);
    expect(clienteB.rowCount).toBe(0);

    // [camino feliz] pero SÍ ve su propia fila.
    const propio = await tx.query("select id from public.clientes where id = $1", [
      a2.clienteId,
    ]);
    expect(propio.rowCount).toBe(1);
  });

  it("el operador de Org A sigue sin ver NADA de Org B (el alcance es 'toda mi org', no 'todas las orgs')", async () => {
    await tx.actAs(f.a.operadorAuthId);

    const clientes = await tx.query("select id from public.clientes");
    expect(clientes.rows.map((r: any) => r.id)).not.toContain(f.b.clienteId);

    const porId = await tx.query("select id from public.clientes where id = $1", [f.b.clienteId]);
    expect(porId.rowCount).toBe(0);
  });
});
