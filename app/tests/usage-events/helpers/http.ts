// Cliente HTTP mínimo para pegarle a `POST /api/usage/events` en el servidor
// de desarrollo real (`npm run dev`), a propósito y no a la función `POST`
// exportada en proceso: el middleware (src/lib/supabase/middleware.ts) es
// justamente una de las piezas que se rompió dos veces en esta tarea (dejaba
// la ruta pública o no según cómo estuviera escrita la excepción), y solo
// pegándole por HTTP real se ejercita esa capa. Ver prompt de la tarea.

import { randomUUID } from "node:crypto";

export const BASE_URL = process.env.KAUDAL_TEST_BASE_URL ?? "http://localhost:3000";
export const ENDPOINT = `${BASE_URL}/api/usage/events`;

/**
 * Identificador de "IP" único para aislar el rate limit por IP
 * (`usage-ip:<ip>`) entre tests que no están probando ese límite a propósito.
 * La ruta no valida que `X-Forwarded-For` sea una IP real (ver route.ts: solo
 * hace `.split(",")[0]?.trim()` y lo usa como clave de un Map), así que un
 * string único cualquiera sirve para no compartir balde con otro test.
 */
export function ipUnica(): string {
  return `test-ip-${randomUUID()}`;
}

export interface PostEventoParams {
  /** Token en claro para `Authorization: Bearer <token>`. Ignorado si `omitirAuth` es true. */
  token?: string;
  /** Si es true, no se manda cabecera Authorization en absoluto (caso "token ausente"). */
  omitirAuth?: boolean;
  body?: unknown;
  /** Cuerpo crudo (para probar límite de tamaño / JSON inválido) — si se da, gana sobre `body`. */
  rawBody?: string;
  idempotencyKey?: string;
  /** X-Forwarded-For a mandar. Por defecto, uno único por request (ver ipUnica). */
  ip?: string;
}

export async function postEvento(params: PostEventoParams = {}): Promise<Response> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (!params.omitirAuth) {
    headers["Authorization"] = `Bearer ${params.token ?? ""}`;
  }
  if (params.idempotencyKey) headers["Idempotency-Key"] = params.idempotencyKey;
  headers["X-Forwarded-For"] = params.ip ?? ipUnica();

  const body = params.rawBody !== undefined ? params.rawBody : JSON.stringify(params.body ?? {});
  return fetch(ENDPOINT, { method: "POST", headers, body });
}

export interface ResultadoLigero {
  status: number;
  retryAfter: string | null;
}

/**
 * Dispara `total` requests contra el endpoint, en tandas concurrentes (no
 * todas a la vez, para no saturar el pool de sockets keep-alive de undici).
 * Consume el body de cada respuesta (para liberar el socket) y solo guarda lo
 * mínimo necesario para las aserciones de rate limit.
 */
export async function dispararRafaga(
  total: number,
  hacerRequest: () => Promise<Response>,
  tamanoTanda = 40,
): Promise<ResultadoLigero[]> {
  const resultados: ResultadoLigero[] = [];
  for (let i = 0; i < total; i += tamanoTanda) {
    const n = Math.min(tamanoTanda, total - i);
    const tanda = await Promise.all(
      Array.from({ length: n }, async () => {
        const res = await hacerRequest();
        const retryAfter = res.headers.get("retry-after");
        await res.text();
        return { status: res.status, retryAfter };
      }),
    );
    resultados.push(...tanda);
  }
  return resultados;
}

/**
 * Confirma que el servidor de dev está arriba antes de correr la suite. Sin
 * esto, cada test fallaría con un "fetch failed" críptico en vez de decir
 * claramente qué falta.
 */
export async function asegurarServidorArriba(): Promise<void> {
  try {
    await postEvento({ omitirAuth: true });
  } catch (err) {
    throw new Error(
      `No se pudo conectar a ${ENDPOINT}. Esta suite prueba HTTP real: corre ` +
        `"npm run dev" en app/ (puerto 3000, o define KAUDAL_TEST_BASE_URL) antes ` +
        `de correr estos tests. Causa original: ${(err as Error).message}`,
    );
  }
}
