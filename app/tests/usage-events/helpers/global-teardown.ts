// Global teardown de la suite de `POST /api/usage/events` (Tarea 7.1): red de
// seguridad además del `afterAll` explícito de cada archivo. Mismo patrón que
// tests/rls/helpers/global-teardown.ts, pero acotado a los fixtures marcados
// 'kaudal-usage-test' (ver tests/usage-events/helpers/db.ts) — nunca toca los
// marcados 'kaudal-rls-test' ni los datos de `npm run seed:local`.
//
// Corre en un módulo separado de los archivos de test (así es `globalSetup`
// en Vitest), por eso arma su propia conexión en vez de reusar `pool` de
// helpers/db.ts.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { Client } from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(here, "../../../.env.local") });

const MARCA = "kaudal-usage-test";

export default async function setup() {
  // Nada que preparar antes de la suite: cada test siembra sus propios fixtures.
  return async () => {
    const connectionString = process.env.SUPABASE_DB_URL;
    if (!connectionString) return; // ya habría fallado antes en helpers/db.ts

    const client = new Client({ connectionString });
    await client.connect();
    try {
      const conteos = await client.query<{ tabla: string; filas: string }>(
        `with orgs_test as (
           select id from public.orgs where nombre like '${MARCA}%'
         )
         select 'orgs' as tabla, count(*)::text as filas from orgs_test
         union all select 'clientes', count(*)::text from public.clientes where org_id in (select id from orgs_test)
         union all select 'agentes', count(*)::text from public.agentes where org_id in (select id from orgs_test)
         union all select 'registros_uso', count(*)::text from public.registros_uso where org_id in (select id from orgs_test)`,
      );

      const residuales = conteos.rows.filter((r) => Number(r.filas) > 0);
      if (residuales.length === 0) {
        // eslint-disable-next-line no-console
        console.log(
          "[usage-events-teardown] Base limpia: 0 filas en tablas de negocio tras la suite.",
        );
        return;
      }

      // eslint-disable-next-line no-console
      console.warn(
        "[usage-events-teardown] ADVERTENCIA: quedaron filas tras la suite (esperado: 0). " +
          "Intentando limpiar solo los fixtures marcados 'kaudal-usage-test' antes de fallar la corrida.",
        residuales,
      );

      const orgsMarcadas = await client.query<{ id: string }>(
        `select id from public.orgs where nombre like '${MARCA}%'`,
      );
      if (orgsMarcadas.rows.length > 0) {
        const ids = orgsMarcadas.rows.map((r) => r.id);
        // delete en orden hijo->padre; FKs son RESTRICT así que no hay cascade.
        await client.query(`delete from public.registros_uso where org_id = any($1)`, [ids]);
        await client.query(`delete from public.agentes where org_id = any($1)`, [ids]);
        await client.query(`delete from public.clientes where org_id = any($1)`, [ids]);
        // Solo para recuperación de fixtures de test: audit_log es append-only
        // y por eso su regla bloquea un DELETE normal. La sesión es postgres y
        // el cambio es LOCAL a esta transacción explícita.
        await client.query("begin");
        try {
          await client.query("set local session_replication_role = replica");
          await client.query(`delete from public.audit_log where org_id = any($1)`, [ids]);
          await client.query("commit");
        } catch (error) {
          await client.query("rollback");
          throw error;
        }
        await client.query(`delete from public.orgs where id = any($1)`, [ids]);
      }

      const recuento = await client.query<{ n: string }>(
        `select count(*)::text as n from public.orgs where nombre like '${MARCA}%'`,
      );
      if (Number(recuento.rows[0].n) > 0) {
        throw new Error(
          "[usage-events-teardown] No se pudo limpiar por completo la base tras la suite. " +
            "Revisar manualmente supabase_db_erp-de-agentes.",
        );
      }

      // eslint-disable-next-line no-console
      console.warn(
        "[usage-events-teardown] Limpieza de emergencia aplicada. La suite debería " +
          "investigarse: algún test no limpió sus fixtures en su propio afterAll.",
      );
      throw new Error(
        "[usage-events-teardown] La suite dejó filas residuales que tuvieron que limpiarse " +
          "manualmente al final (ver advertencias arriba). Revisar qué test no limpió.",
      );
    } finally {
      await client.end();
    }
  };
}
