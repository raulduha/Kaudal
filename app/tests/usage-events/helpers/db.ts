// Helpers de fixtures para las pruebas HTTP de `POST /api/usage/events`
// (Tarea 7.1).
//
// A diferencia de app/tests/rls (que simula una sesión `authenticated` de
// Postgres dentro de una transacción con ROLLBACK), este endpoint no usa
// sesión de Supabase Auth: lo llama un AGENTE externo con `Authorization:
// Bearer <ingest_token>`, y quien procesa el request es el servidor Next de
// verdad (`npm run dev`), que escribe con su propio cliente `service_role` en
// SU PROPIO commit — no en la transacción de este archivo. Por eso los
// fixtures se insertan en autocommit (sin BEGIN/ROLLBACK) y se limpian con
// DELETE explícito en vez de rollback (ver prompt de la tarea, sección
// "Limpieza de datos").

import { randomBytes, createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { Pool } from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));
// app/tests/usage-events/helpers/db.ts -> app/.env.local
loadEnv({ path: path.resolve(here, "../../../.env.local") });

const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) {
  throw new Error(
    "Falta SUPABASE_DB_URL en app/.env.local. Estas pruebas necesitan conexión " +
      "directa a Postgres (ver docker: supabase_db_erp-de-agentes) para sembrar " +
      "y limpiar fixtures — el endpoint en sí se prueba por HTTP, no por esta conexión.",
  );
}

/** Conexión directa a Postgres, en autocommit (nunca envuelta en una transacción de rollback: ver cabecera). */
export const pool = new Pool({ connectionString, max: 5 });

/** Marca todos nuestros fixtures para poder encontrarlos/limpiarlos sin ambigüedad. */
export const MARCA_TEST = "kaudal-usage-test";
const DOMINIO_TEST = "test.kaudal.cl";

export type EstadoAgente = "activo" | "pausado" | "archivado" | "caido";

export interface AgenteFixture {
  orgId: string;
  clienteId: string;
  agenteId: string;
  /** Token de ingesta en CLARO (solo existe acá, en memoria de test — la tabla guarda el hash). */
  token: string;
}

/**
 * Crea org + cliente + agente con un `ingest_token` real, insertando el hash
 * directo en `agentes.ingest_token_hash` (exactamente lo que hace la ruta al
 * generar uno — no hace falta pasar por `POST /api/agentes`).
 */
export async function crearAgenteFixture(
  opts: { estado?: EstadoAgente; modeloDefault?: string | null } = {},
): Promise<AgenteFixture> {
  const estado = opts.estado ?? "activo";
  const sufijo = randomUUID().slice(0, 8);

  const org = await pool.query<{ id: string }>(
    `insert into public.orgs (nombre, email_contacto) values ($1, $2) returning id`,
    [`${MARCA_TEST} Org ${sufijo}`, `org-${sufijo}@${DOMINIO_TEST}`],
  );
  const orgId = org.rows[0].id;

  const cliente = await pool.query<{ id: string }>(
    `insert into public.clientes (org_id, razon_social, email) values ($1, $2, $3) returning id`,
    [orgId, `${MARCA_TEST} Cliente ${sufijo}`, `cliente-${sufijo}@${DOMINIO_TEST}`],
  );
  const clienteId = cliente.rows[0].id;

  // 192 bits como el token real (docs/eng/01 §5.1 / comentario de route.ts) — no es
  // requisito del test, pero evita que el fixture entrene un hábito de tokens débiles.
  const token = randomBytes(24).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");

  const agente = await pool.query<{ id: string }>(
    `insert into public.agentes
       (org_id, cliente_id, nombre, estado, modelo_default, ingest_token_hash, metodo_reporte)
     values ($1, $2, $3, $4, $5, $6, 'reportado')
     returning id`,
    [orgId, clienteId, `${MARCA_TEST} Agente ${sufijo}`, estado, opts.modeloDefault ?? null, tokenHash],
  );
  const agenteId = agente.rows[0].id;

  return { orgId, clienteId, agenteId, token };
}

/** Borra un fixture y todo lo que la ruta real haya podido insertar bajo su org_id. */
export async function limpiarFixture(f: Pick<AgenteFixture, "orgId">): Promise<void> {
  await pool.query(`delete from public.registros_uso where org_id = $1`, [f.orgId]);
  await pool.query(`delete from public.agentes where org_id = $1`, [f.orgId]);
  await pool.query(`delete from public.clientes where org_id = $1`, [f.orgId]);
  // audit_log es append-only en producción. Los fixtures HTTP no viven dentro
  // de una transacción con ROLLBACK, así que se elimina únicamente su bitácora
  // con una sesión postgres y replication_role LOCAL antes de borrar la org.
  // Nunca se usa esta vía en código de aplicación.
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local session_replication_role = replica");
    await client.query(`delete from public.audit_log where org_id = $1`, [f.orgId]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
  await pool.query(`delete from public.orgs where id = $1`, [f.orgId]);
}

/** Cuántas orgs marcadas como fixture de esta suite quedan en la base (debería ser 0 al final). */
export async function contarOrgsResiduales(): Promise<number> {
  const r = await pool.query<{ n: string }>(
    `select count(*)::text as n from public.orgs where nombre like $1`,
    [`${MARCA_TEST}%`],
  );
  return Number(r.rows[0].n);
}

/**
 * Lleva la cuenta de los fixtures creados en un archivo de test para poder
 * limpiarlos todos en `afterAll`, sin repetir el mismo array en cada archivo.
 */
export class RastreadorFixtures {
  private creados: AgenteFixture[] = [];

  async nuevoAgente(opts?: { estado?: EstadoAgente; modeloDefault?: string | null }): Promise<AgenteFixture> {
    const f = await crearAgenteFixture(opts);
    this.creados.push(f);
    return f;
  }

  async limpiarTodo(): Promise<void> {
    for (const f of this.creados) {
      await limpiarFixture(f);
    }
    this.creados = [];
  }
}
