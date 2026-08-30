// Mismo patrón que tests/usage-events/helpers/global-teardown.ts: red de
// seguridad además del afterAll explícito de cada archivo. Acotado a los
// tickets marcados con MARCA_ASUNTO — nunca toca el ticket del seed ni datos
// de otras suites.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { Client } from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(here, "../../../.env.local") });

const MARCA = "kaudal-portal-tickets-test";

export default async function setup() {
  return async () => {
    const connectionString = process.env.SUPABASE_DB_URL;
    if (!connectionString) return;

    const client = new Client({ connectionString });
    await client.connect();
    try {
      const residuales = await client.query<{ id: string }>(
        `select id from public.tickets_reclamos where asunto like '${MARCA}%'`
      );
      if (residuales.rowCount === 0) {
        // eslint-disable-next-line no-console
        console.log("[portal-tickets-teardown] Base limpia: 0 tickets de prueba residuales.");
        return;
      }

      // eslint-disable-next-line no-console
      console.warn(
        `[portal-tickets-teardown] ADVERTENCIA: ${residuales.rowCount} ticket(s) de prueba residual(es). Limpiando.`
      );
      const ids = residuales.rows.map((r) => r.id);
      await client.query(`delete from public.mensajes_ticket where ticket_id = any($1)`, [ids]);
      await client.query(`delete from public.tickets_reclamos where id = any($1)`, [ids]);

      throw new Error(
        "[portal-tickets-teardown] La suite dejó tickets residuales que tuvieron que limpiarse " +
          "al final. Revisar qué test no limpió en su propio afterAll."
      );
    } finally {
      await client.end();
    }
  };
}
