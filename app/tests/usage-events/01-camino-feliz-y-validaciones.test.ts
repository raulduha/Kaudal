// Tarea 7.1 · POST /api/usage/events — camino feliz, idempotencia,
// autenticación y validaciones de borde.
//
// Enfoque: HTTP real contra el servidor de dev (ver helpers/http.ts) para
// todos los casos — incluye la capa de middleware, que es justamente la que
// se rompió dos veces en esta tarea. Requiere `npm run dev` corriendo.

import { randomUUID } from "node:crypto";
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
    throw new Error(
      `Quedaron ${residuos} orgs 'kaudal-usage-test' sin limpiar tras 01-camino-feliz-y-validaciones.test.ts.`,
    );
  }
});

describe("[camino feliz] token real + tokens reportados", () => {
  it("modelo sembrado con tarifa real -> 202, source 'reported', costo exacto", async () => {
    const agente = await fixtures.nuevoAgente({ modeloDefault: "claude-sonnet-4-5" });

    // claude-sonnet-4-5 (migración 20260827180000): input 0.003 USD/1k, output
    // 0.015 USD/1k, fx 950. costoUsd = 2*0.003 + 1*0.015 = 0.021; *950 = 19.95 CLP.
    const res = await postEvento({
      token: agente.token,
      body: {
        model: "claude-sonnet-4-5",
        input_tokens: 2000,
        output_tokens: 1000,
        units: 1,
        status: "ok",
      },
    });

    expect(res.status).toBe(202);
    const json = (await res.json()) as { id: string; source: string; estimated_cost_clp: number };
    expect(typeof json.id).toBe("string");
    // En inglés, no "reportado" — bug real ya corregido (ver docstring de route.ts).
    expect(json.source).toBe("reported");
    expect(json.estimated_cost_clp).toBeCloseTo(19.95, 4);

    const fila = await pool.query<{ origen: string; costo_estimado: string; tokens_in: string; tokens_out: string }>(
      `select origen, costo_estimado, tokens_in, tokens_out from public.registros_uso where id = $1`,
      [json.id],
    );
    // tokens_in/tokens_out son bigint en Postgres: node-pg los trae como string.
    expect(fila.rows[0].origen).toBe("reportado");
    expect(Number(fila.rows[0].costo_estimado)).toBeCloseTo(19.95, 4);
    expect(Number(fila.rows[0].tokens_in)).toBe(2000);
    expect(Number(fila.rows[0].tokens_out)).toBe(1000);
  });
});

describe("evento sin tokens (solo units)", () => {
  it("sin input_tokens/output_tokens -> 202, source 'estimated_event', costo 0", async () => {
    const agente = await fixtures.nuevoAgente({ modeloDefault: "claude-sonnet-4-5" });

    const res = await postEvento({ token: agente.token, body: { units: 3 } });

    expect(res.status).toBe(202);
    const json = (await res.json()) as { id: string; source: string; estimated_cost_clp: number };
    expect(json.source).toBe("estimated_event");
    // Sin perfil de tokens promedio todavía: no debe inventar un número.
    expect(json.estimated_cost_clp).toBe(0);
  });
});

describe("idempotencia", () => {
  it("mismo Idempotency-Key dos veces -> mismo id, una sola fila en registros_uso", async () => {
    const agente = await fixtures.nuevoAgente();
    const key = randomUUID();

    const res1 = await postEvento({ token: agente.token, idempotencyKey: key, body: { units: 1 } });
    expect(res1.status).toBe(202);
    const json1 = (await res1.json()) as { id: string };

    const res2 = await postEvento({ token: agente.token, idempotencyKey: key, body: { units: 1 } });
    expect(res2.status).toBe(202);
    const json2 = (await res2.json()) as { id: string };

    expect(json2.id).toBe(json1.id);

    const filas = await pool.query<{ n: string }>(
      `select count(*)::text as n from public.registros_uso where agente_id = $1 and idempotency_key = $2`,
      [agente.agenteId, key],
    );
    expect(Number(filas.rows[0].n)).toBe(1);
  });
});

describe("token inválido", () => {
  it("token falso -> 401", async () => {
    const res = await postEvento({ token: "esto-no-es-un-ingest-token-real", body: { units: 1 } });
    expect(res.status).toBe(401);
  });

  it("token vacío (Authorization: Bearer <vacío>) -> 401", async () => {
    const res = await postEvento({ token: "", body: { units: 1 } });
    expect(res.status).toBe(401);
  });

  it("sin cabecera Authorization -> 401", async () => {
    const res = await postEvento({ omitirAuth: true, body: { units: 1 } });
    expect(res.status).toBe(401);
  });
});

describe("agente pausado/archivado", () => {
  it.each(["pausado", "archivado"] as const)(
    "agente %s con token por lo demás válido -> 403",
    async (estado) => {
      const agente = await fixtures.nuevoAgente({ estado });
      const res = await postEvento({ token: agente.token, body: { units: 1 } });
      expect(res.status).toBe(403);
    },
  );
});

describe("límites de tokens/unidades (M2)", () => {
  it.each([
    ["input_tokens excede el máximo (10M)", { input_tokens: 10_000_001 }],
    ["output_tokens negativo", { output_tokens: -1 }],
    ["units excede el máximo (1000)", { units: 1001 }],
    ["units en cero (no positivo)", { units: 0 }],
  ] as const)("%s -> 400", async (_desc, campos) => {
    const agente = await fixtures.nuevoAgente();
    const res = await postEvento({ token: agente.token, body: campos });
    expect(res.status).toBe(400);
  });
});

describe("occurred_at fuera de ventana", () => {
  it("muy en el futuro (>5 min) -> 400", async () => {
    const agente = await fixtures.nuevoAgente();
    const futuro = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const res = await postEvento({ token: agente.token, body: { occurred_at: futuro, units: 1 } });
    expect(res.status).toBe(400);
  });

  it("muy en el pasado (>30 días) -> 400", async () => {
    const agente = await fixtures.nuevoAgente();
    const pasado = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    const res = await postEvento({ token: agente.token, body: { occurred_at: pasado, units: 1 } });
    expect(res.status).toBe(400);
  });

  it("[camino feliz] dentro de ventana -> 202", async () => {
    const agente = await fixtures.nuevoAgente();
    const haceUnMinuto = new Date(Date.now() - 60 * 1000).toISOString();
    const res = await postEvento({ token: agente.token, body: { occurred_at: haceUnMinuto, units: 1 } });
    expect(res.status).toBe(202);
  });
});

describe("body demasiado grande", () => {
  it("cuerpo > 32KB -> 413", async () => {
    const agente = await fixtures.nuevoAgente();
    const relleno = "a".repeat(40_000);
    const res = await postEvento({ token: agente.token, rawBody: relleno });
    expect(res.status).toBe(413);
  });
});

describe("model con caracteres de inyección/control", () => {
  it.each([
    ["fórmula CSV (=cmd|calc)", "=cmd|calc"],
    ["salto de línea", "claude\ninject"],
    ["retorno de carro", "claude\rinject"],
  ] as const)("%s -> 400", async (_desc, modelo) => {
    const agente = await fixtures.nuevoAgente();
    const res = await postEvento({ token: agente.token, body: { model: modelo, units: 1 } });
    expect(res.status).toBe(400);
  });
});
