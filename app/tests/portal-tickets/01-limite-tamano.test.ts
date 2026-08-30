// Regresión del hallazgo MEDIO-2 de la auditoría de seguridad de la tarea
// 9.1: la guardia original leía `content-length` con
// `Number(req.headers.get("content-length"))` y probaba `Number.isFinite`,
// pero `Number(null) === 0` — que ES finito — así que un request SIN ese
// header (HTTP/2 puede omitirlo; `Transfer-Encoding: chunked` nunca lo trae)
// pasaba la guardia con "0 bytes declarados" y llegaba a `req.formData()`
// sin ningún tope, bufferando el body completo en memoria antes de
// rechazarlo. Fix real: `lib/http/cuerpo-acotado.ts` corta el STREAM del
// body apenas supera el máximo, sin depender de ningún header declarado.
//
// Se prueba por HTTP real (no llamando el handler en proceso) porque el bug
// vive justo en cómo Next.js arma el `Request` a partir de la conexión TCP
// real — y porque de paso expuso un segundo problema real: Next.js trunca en
// silencio a 10 MB el body de cualquier ruta detrás de `middleware.ts` salvo
// que se suba `experimental.middlewareClientMaxBodySize` (next.config.mjs) —
// sin esa config, este mismo test habría fallado con un 400 de parseo
// confuso en vez del 413 correcto.
import { afterAll, describe, expect, it } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { Client } from "pg";
import { BASE_URL, MARCA_ASUNTO, crearTicketSinContentLength, loginCliente, multipartCrudo } from "./helpers/http";

const here = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(here, "../../.env.local") });

const MAX_CUERPO_BYTES = 56 * 1024 * 1024;

async function limpiarPorAsunto(asunto: string) {
  const client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
  await client.connect();
  try {
    await client.query(
      `delete from public.mensajes_ticket where ticket_id in (select id from public.tickets_reclamos where asunto = $1)`,
      [asunto]
    );
    await client.query(`delete from public.tickets_reclamos where asunto = $1`, [asunto]);
  } finally {
    await client.end();
  }
}

describe("POST /api/portal/tickets — tope de tamaño de body", () => {
  const asuntosCreados: string[] = [];

  afterAll(async () => {
    for (const asunto of asuntosCreados) await limpiarPorAsunto(asunto);
  });

  it("cuerpo real de más de 56 MB SIN content-length (chunked) -> 413, no 201 ni 400 confuso", async () => {
    const cookie = await loginCliente();
    const asunto = `${MARCA_ASUNTO}-tope-${Date.now()}`;
    asuntosCreados.push(asunto);

    // Un archivo de sobra sobre el tope; el nombre no importa (se rechaza
    // por tamaño antes de llegar a validarAdjunto/la extensión).
    const bytesArchivo = new Uint8Array(MAX_CUERPO_BYTES + 2 * 1024 * 1024);
    const { boundary, cuerpo } = multipartCrudo(
      { tipo: "duda", asunto, cuerpo: "Body de prueba para el tope de tamaño." },
      { nombre: "grande.bin", bytes: bytesArchivo }
    );

    const res = await crearTicketSinContentLength(cookie, cuerpo, boundary);
    expect(res.status).toBe(413);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.error).toMatch(/pesan demasiado/i);
  }, 30_000);

  it("[regresión] un ticket normal, chico, sin content-length forzado -> sigue creándose bien (201)", async () => {
    const cookie = await loginCliente();
    const asunto = `${MARCA_ASUNTO}-normal-${Date.now()}`;
    asuntosCreados.push(asunto);

    const { boundary, cuerpo } = multipartCrudo({
      tipo: "duda",
      asunto,
      cuerpo: "Ticket chico, no debería tropezar con la guardia de tamaño.",
    });

    const res = await crearTicketSinContentLength(cookie, cuerpo, boundary);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(typeof data.ticketId).toBe("string");
  });
});
