// Tarea 7.1 · POST /api/usage/events — aislamiento multi-tenant.
//
// Este endpoint NO tiene sesión de Supabase Auth ni RLS de por medio (escribe
// con service_role): el aislamiento depende enteramente de que el backend
// derive org_id/cliente_id/agente_id SOLO del ingest_token resuelto, nunca de
// nada que el body del request pueda aportar (docs/eng/07 §2.4, migración
// 20260827180000 §5). Estos tests verifican ambas mitades de esa garantía.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RastreadorFixtures, contarOrgsResiduales, pool } from "./helpers/db";
import { asegurarServidorArriba, postEvento } from "./helpers/http";

const fixtures = new RastreadorFixtures();

beforeAll(async () => {
  await asegurarServidorArriba();
});

afterAll(async () => {
  await fixtures.limpiarTodo();
  const residuos = await contarOrgsResiduales();
  if (residuos > 0) {
    throw new Error(`Quedaron ${residuos} orgs 'kaudal-usage-test' sin limpiar tras 02-aislamiento.test.ts.`);
  }
});

describe("aislamiento cross-tenant", () => {
  it("el body no puede aportar org_id/cliente_id/agente_id de otra org (schema .strict() los rechaza) -> 400", async () => {
    const agenteA = await fixtures.nuevoAgente();
    const agenteB = await fixtures.nuevoAgente();

    const res = await postEvento({
      token: agenteA.token,
      body: {
        units: 1,
        // Ninguno de estos campos existe en el schema Zod del endpoint: con
        // .strict(), su sola presencia debe tumbar la validación — el backend
        // nunca debería siquiera intentar leerlos.
        org_id: agenteB.orgId,
        cliente_id: agenteB.clienteId,
        agente_id: agenteB.agenteId,
      },
    });

    expect(res.status).toBe(400);

    // Confirma que además NO se coló una fila con los IDs de B.
    const filas = await pool.query<{ n: string }>(
      `select count(*)::text as n from public.registros_uso where org_id = $1`,
      [agenteB.orgId],
    );
    expect(Number(filas.rows[0].n)).toBe(0);
  });

  it("[camino feliz] la fila insertada usa SIEMPRE los ids resueltos del token de A, nunca los de B", async () => {
    const agenteA = await fixtures.nuevoAgente();
    const agenteB = await fixtures.nuevoAgente();

    const res = await postEvento({ token: agenteA.token, body: { units: 1, model: "claude-sonnet-4-5" } });
    expect(res.status).toBe(202);
    const json = (await res.json()) as { id: string };

    const fila = await pool.query<{ org_id: string; cliente_id: string; agente_id: string }>(
      `select org_id, cliente_id, agente_id from public.registros_uso where id = $1`,
      [json.id],
    );
    expect(fila.rowCount).toBe(1);
    const row = fila.rows[0];

    expect(row.org_id).toBe(agenteA.orgId);
    expect(row.cliente_id).toBe(agenteA.clienteId);
    expect(row.agente_id).toBe(agenteA.agenteId);

    expect(row.org_id).not.toBe(agenteB.orgId);
    expect(row.cliente_id).not.toBe(agenteB.clienteId);
    expect(row.agente_id).not.toBe(agenteB.agenteId);
  });

  it("un evento reportado con el token de A no aparece bajo la org de B al filtrar por org_id de B", async () => {
    const agenteA = await fixtures.nuevoAgente();
    const agenteB = await fixtures.nuevoAgente();

    await postEvento({ token: agenteA.token, body: { units: 1 } });

    const filasDeB = await pool.query<{ n: string }>(
      `select count(*)::text as n from public.registros_uso where org_id = $1`,
      [agenteB.orgId],
    );
    expect(Number(filasDeB.rows[0].n)).toBe(0);
  });
});
