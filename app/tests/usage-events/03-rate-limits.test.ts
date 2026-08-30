// Tarea 7.1 · POST /api/usage/events — rate limit por IP (antes de resolver
// el token) y por agente (después).
//
// Ambos límites (`verificarLimiteGenerico`, lib/auth/rate-limit.ts) son
// ventanas fijas de 60s en un Map en memoria del proceso del servidor de dev,
// sin gancho para inyectar un límite más bajo en test. Se dispara el umbral
// real: 120/min por agente, 600/min por IP. La clave de IP es literalmente lo
// que venga en `X-Forwarded-For` (la ruta no la valida como IP — ver
// helpers/http.ts), así que cada test usa un valor único para no compartir
// balde con otros tests de esta suite, EXCEPTO el propio test de límite por
// IP, que a propósito reutiliza un solo valor para todas sus requests.
//
// Archivo separado del resto: son los tests más lentos de la suite (cientos
// de requests reales), y así se pueden correr/timeout-ear por separado.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RastreadorFixtures, contarOrgsResiduales } from "./helpers/db";
import { asegurarServidorArriba, dispararRafaga, ipUnica, postEvento } from "./helpers/http";

const fixtures = new RastreadorFixtures();

beforeAll(async () => {
  await asegurarServidorArriba();
});

afterAll(async () => {
  await fixtures.limpiarTodo();
  const residuos = await contarOrgsResiduales();
  if (residuos > 0) {
    throw new Error(`Quedaron ${residuos} orgs 'kaudal-usage-test' sin limpiar tras 03-rate-limits.test.ts.`);
  }
});

describe("rate limit", () => {
  it(
    "por agente: pasado 120/min responde 429 con Retry-After",
    async () => {
      const agente = await fixtures.nuevoAgente();
      // IP única y propia de este test: así el balde de IP (600/min) no se
      // contamina con las ~130 requests que siguen, y esas 130 no cuentan
      // para el test de IP de más abajo.
      const ipDelTest = ipUnica();
      const TOTAL = 130; // LIMITE_POR_MINUTO (120) + margen

      const resultados = await dispararRafaga(TOTAL, () =>
        postEvento({ token: agente.token, ip: ipDelTest, body: { units: 1 } }),
      );

      const con429 = resultados.filter((r) => r.status === 429);
      expect(con429.length).toBeGreaterThan(0);
      expect(con429[0].retryAfter).toBeTruthy();
      expect(Number(con429[0].retryAfter)).toBeGreaterThan(0);

      // El resto de las respuestas no-429 deben ser 202 (éxitos reales, no
      // otro tipo de error escondiendo el rate limit).
      const otras = resultados.filter((r) => r.status !== 429);
      expect(otras.every((r) => r.status === 202)).toBe(true);
    },
    30_000,
  );

  it(
    "por IP: pasado 600/min responde 429 con Retry-After, ANTES de resolver el token",
    async () => {
      const ipDelTest = ipUnica();
      const TOTAL = 610; // LIMITE_POR_IP_POR_MINUTO (600) + margen

      // Sin Authorization: si el límite de IP no disparara, cada request
      // devolvería 401 ("Falta el token de ingesta") — nunca 202 ni ningún
      // otro código. Ver esto confirma que el chequeo de IP corre ANTES de
      // intentar resolver el token (route.ts: la IP se evalúa antes de leer
      // la cabecera Authorization).
      const resultados = await dispararRafaga(TOTAL, () =>
        postEvento({ omitirAuth: true, ip: ipDelTest }),
      );

      const con429 = resultados.filter((r) => r.status === 429);
      expect(con429.length).toBeGreaterThan(0);
      expect(con429[0].retryAfter).toBeTruthy();
      expect(Number(con429[0].retryAfter)).toBeGreaterThan(0);

      const otras = resultados.filter((r) => r.status !== 429);
      expect(otras.every((r) => r.status === 401)).toBe(true);
    },
    60_000,
  );
});
