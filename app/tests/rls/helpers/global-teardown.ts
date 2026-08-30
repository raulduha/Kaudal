// Global teardown de Vitest (Tarea 2.3): red de seguridad además del
// ROLLBACK explícito de cada test. Si por cualquier motivo un test dejó
// fixtures pegados en la base compartida, esto los detecta (y limpia) al
// final de TODA la corrida, en vez de descubrirlo por accidente después.
//
// Corre en un proceso/módulo separado de los archivos de test (así es
// `globalSetup` en Vitest), por eso arma su propia conexión en vez de
// reusar el pool de helpers/db.ts.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { Client } from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(here, "../../../.env.local") });

const TABLAS_NEGOCIO = [
  "orgs",
  "clientes",
  "usuarios",
  "agentes",
  "registros_uso",
  "suscripciones",
  "cobros",
  "tickets_reclamos",
  "mensajes_ticket",
  "audit_log",
  "api_keys_cifradas",
] as const;

export default async function setup() {
  // Nada que preparar antes de la suite: cada test siembra sus propios fixtures.
  return async () => {
    const connectionString = process.env.SUPABASE_DB_URL;
    if (!connectionString) return; // ya habría fallado antes en helpers/db.ts

    const client = new Client({ connectionString });
    await client.connect();
    try {
      // Ojo: esto NO es un count(*) global de las tablas. `npm run seed:local`
      // (tarea 3.1) deja a propósito una org/cliente/usuarios de desarrollo
      // permanentes (operador@kaudal.local, cliente@kaudal.local) — si
      // contáramos filas globales, la suite fallaría SIEMPRE que alguien haya
      // corrido el seed, aunque el ROLLBACK de cada test haya funcionado
      // perfecto. Por eso cada conteo queda acotado a filas conectadas al
      // marcador de fixtures de test (MARCA_TEST = 'kaudal-rls-test', ver
      // helpers/db.ts), que el seed de desarrollo nunca usa.
      const conteos = await client.query<{ tabla: string; filas: string }>(
        `with orgs_test as (
           select id from public.orgs where nombre like 'kaudal-rls-test%'
         )
         select 'orgs' as tabla, count(*)::text as filas from orgs_test
         union all select 'clientes', count(*)::text from public.clientes where org_id in (select id from orgs_test)
         union all select 'usuarios', count(*)::text from public.usuarios where org_id in (select id from orgs_test)
         union all select 'agentes', count(*)::text from public.agentes where org_id in (select id from orgs_test)
         union all select 'registros_uso', count(*)::text from public.registros_uso where org_id in (select id from orgs_test)
         union all select 'suscripciones', count(*)::text from public.suscripciones where org_id in (select id from orgs_test)
         union all select 'cobros', count(*)::text from public.cobros where org_id in (select id from orgs_test)
         union all select 'tickets_reclamos', count(*)::text from public.tickets_reclamos where org_id in (select id from orgs_test)
         union all select 'mensajes_ticket', count(*)::text from public.mensajes_ticket where org_id in (select id from orgs_test)
         union all select 'audit_log', count(*)::text from public.audit_log where org_id in (select id from orgs_test)
         union all select 'api_keys_cifradas', count(*)::text from public.api_keys_cifradas where org_id in (select id from orgs_test)
         union all select 'auth.users', count(*)::text from auth.users where email like '%@test.kaudal.cl'`,
      );

      const residuales = conteos.rows.filter((r) => Number(r.filas) > 0);
      if (residuales.length === 0) {
        // eslint-disable-next-line no-console
        console.log(
          "[rls-teardown] Base limpia: 0 filas en tablas de negocio tras la suite.",
        );
        return;
      }

      // eslint-disable-next-line no-console
      console.warn(
        "[rls-teardown] ADVERTENCIA: quedaron filas tras la suite (esperado: 0). " +
          "Cada test debería terminar en ROLLBACK. Intentando limpiar solo los " +
          "fixtures marcados como 'kaudal-rls-test' antes de fallar la corrida.",
        residuales,
      );

      // Limpieza dirigida: solo orgs marcadas por nuestros fixtures (nunca un
      // TRUNCATE ni un DELETE sin filtro — podría haber datos reales en el futuro).
      const orgsMarcadas = await client.query<{ id: string }>(
        `select id from public.orgs where nombre like 'kaudal-rls-test%'`,
      );
      if (orgsMarcadas.rows.length > 0) {
        const ids = orgsMarcadas.rows.map((r) => r.id);
        // delete en orden hijo->padre; FKs son RESTRICT así que no hay cascade.
        await client.query(`delete from public.audit_log where org_id = any($1)`, [ids]);
        await client.query(`delete from public.mensajes_ticket where org_id = any($1)`, [ids]);
        await client.query(`delete from public.tickets_reclamos where org_id = any($1)`, [ids]);
        await client.query(`delete from public.cobros where org_id = any($1)`, [ids]);
        await client.query(`delete from public.suscripciones where org_id = any($1)`, [ids]);
        await client.query(`delete from public.registros_uso where org_id = any($1)`, [ids]);
        await client.query(`delete from public.agentes where org_id = any($1)`, [ids]);
        await client.query(`delete from public.api_keys_cifradas where org_id = any($1)`, [ids]);
        await client.query(
          `delete from auth.users where id in (select auth_user_id from public.usuarios where org_id = any($1))`,
          [ids],
        );
        await client.query(`delete from public.usuarios where org_id = any($1)`, [ids]);
        await client.query(`delete from public.clientes where org_id = any($1)`, [ids]);
        await client.query(`delete from public.orgs where id = any($1)`, [ids]);
      }

      const recuento = await client.query<{ n: string }>(
        `select count(*)::text as n from public.orgs where nombre like 'kaudal-rls-test%'`,
      );
      if (Number(recuento.rows[0].n) > 0) {
        throw new Error(
          "[rls-teardown] No se pudo limpiar por completo la base tras la suite de RLS. " +
            "Revisar manualmente supabase_db_erp-de-agentes.",
        );
      }

      // eslint-disable-next-line no-console
      console.warn(
        "[rls-teardown] Limpieza de emergencia aplicada. La suite debería " +
          "investigarse: algún test no hizo ROLLBACK correctamente.",
      );
      throw new Error(
        "[rls-teardown] La suite dejó filas residuales que tuvieron que limpiarse " +
          "manualmente al final (ver advertencias arriba). Revisar qué test no hizo ROLLBACK.",
      );
    } finally {
      await client.end();
    }
  };
}

export { TABLAS_NEGOCIO };
