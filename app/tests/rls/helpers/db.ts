// Helpers compartidos para las pruebas de RLS (Tarea 2.3).
//
// Patrón de la sesión coordinadora (ver prompt de la tarea): todavía no hay
// Auth conectado (Fase 3), así que simulamos una sesión `authenticated` de
// Postgres directo, dentro de una transacción que SIEMPRE termina en
// ROLLBACK. Nada de lo que insertan los fixtures debe sobrevivir un test.
//
//   BEGIN;
//   SET LOCAL ROLE authenticated;
//   SELECT set_config('request.jwt.claims', '{"sub":"...","role":"authenticated"}', true);
//   -- ...queries como esa sesión...
//   ROLLBACK;
//
// Los fixtures (orgs/clientes/usuarios/auth.users) se crean ANTES de cambiar
// de rol, con la conexión `postgres` (superusuario, bypassa RLS) que trae
// `SUPABASE_DB_URL`.

import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { Pool, type PoolClient } from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));
// app/tests/rls/helpers/db.ts -> app/.env.local
loadEnv({ path: path.resolve(here, "../../../.env.local") });

const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) {
  throw new Error(
    "Falta SUPABASE_DB_URL en app/.env.local. Las pruebas de RLS necesitan " +
      "conexión directa a Postgres (ver docker: supabase_db_erp-de-agentes).",
  );
}

export const pool = new Pool({ connectionString, max: 5 });

export async function closePool(): Promise<void> {
  await pool.end();
}

/** Marca todos nuestros fixtures para poder identificarlos/limpiarlos sin ambigüedad. */
export const MARCA_TEST = "kaudal-rls-test";
export const DOMINIO_TEST = "test.kaudal.cl";

/**
 * Una transacción de prueba: se abre con BEGIN, se puede alternar entre el
 * rol `postgres` (fixtures, bypass RLS) y `authenticated` (simular sesión),
 * y SIEMPRE se cierra con ROLLBACK — sin importar si el test falló — para
 * que nada persista en la base compartida.
 */
export class RlsTx {
  private constructor(public readonly client: PoolClient) {}

  static async begin(): Promise<RlsTx> {
    const client = await pool.connect();
    await client.query("BEGIN");
    return new RlsTx(client);
  }

  /** Simula la sesión de un usuario autenticado (lee su fila en public.usuarios vía auth.uid()). */
  async actAs(authUserId: string): Promise<void> {
    await this.client.query("SET LOCAL ROLE authenticated");
    await this.client.query(
      `SELECT set_config('request.jwt.claims', $1, true)`,
      [JSON.stringify({ sub: authUserId, role: "authenticated" })],
    );
  }

  /** Simula un cliente `anon` (sin sesión, como si golpeara la API pública sin login). */
  async actAsAnon(): Promise<void> {
    await this.client.query("SET LOCAL ROLE anon");
    await this.client.query(`SELECT set_config('request.jwt.claims', '', true)`);
  }

  /** Vuelve al rol de conexión original (postgres, superusuario) para preparar/inspeccionar fixtures. */
  async actAsPostgres(): Promise<void> {
    await this.client.query("RESET ROLE");
    await this.client.query(`SELECT set_config('request.jwt.claims', '', true)`);
  }

  query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params: unknown[] = [],
  ) {
    return this.client.query<T>(text, params);
  }

  /**
   * Corre una consulta que ESPERAMOS que falle (permission denied, RLS,
   * excepción de un RPC, etc.) sin dejar la transacción entera "aborted"
   * para el resto del test — Postgres no permite seguir usando una
   * transacción después de un error hasta hacer ROLLBACK (o, como acá, un
   * ROLLBACK TO SAVEPOINT que solo deshace esa consulta puntual).
   *
   * Devuelve el error capturado (con su `.message` y `.code`/SQLSTATE) para
   * que el test lo revise. Si la consulta NO lanza excepción, esto mismo
   * falla el test (con un mensaje claro) en vez de dejar pasar el caso en
   * silencio.
   */
  async queryExpectingError(
    text: string,
    params: unknown[] = [],
  ): Promise<Error & { code?: string }> {
    const savepoint = `sp_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    await this.client.query(`SAVEPOINT "${savepoint}"`);

    let caught: (Error & { code?: string }) | null = null;
    try {
      await this.client.query(text, params);
    } catch (err) {
      caught = err as Error & { code?: string };
    }

    await this.client.query(`ROLLBACK TO SAVEPOINT "${savepoint}"`);
    await this.client.query(`RELEASE SAVEPOINT "${savepoint}"`);

    if (!caught) {
      throw new Error(
        `Se esperaba que esta consulta lanzara una excepción, pero se ejecutó sin error: ${text}`,
      );
    }
    return caught;
  }

  /** SIEMPRE cerrar así, incluso si el test lanzó excepción (usar try/finally). */
  async rollback(): Promise<void> {
    try {
      await this.client.query("ROLLBACK");
    } finally {
      this.client.release();
    }
  }
}

export interface OrgFixture {
  label: string;
  orgId: string;
  clienteId: string;
  operadorAuthId: string;
  operadorUsuarioId: string;
  clienteAuthId: string;
  clienteUsuarioId: string;
  apiKeyId: string;
  agenteId: string;
  registroUsoId: string;
  suscripcionId: string;
  cobroId: string;
  ticketId: string;
  mensajePublicoId: string;
  mensajeInternoId: string;
  auditLogId: string;
}

export interface TwoOrgFixtures {
  a: OrgFixture;
  b: OrgFixture;
}

async function insertAuthUser(tx: RlsTx, id: string, email: string): Promise<void> {
  await tx.query(
    `insert into auth.users
       (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at)
     values
       ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2,
        '{}'::jsonb, '{}'::jsonb, now(), now())`,
    [id, email],
  );
}

async function seedOrg(tx: RlsTx, label: "A" | "B"): Promise<OrgFixture> {
  const suffix = randomUUID().slice(0, 8);
  const emailFor = (who: string) => `${who}-${label.toLowerCase()}-${suffix}@${DOMINIO_TEST}`;

  const org = await tx.query<{ id: string }>(
    `insert into public.orgs (nombre, email_contacto)
     values ($1, $2) returning id`,
    [`${MARCA_TEST} Org ${label} ${suffix}`, emailFor("org")],
  );
  const orgId = org.rows[0].id;

  const cliente = await tx.query<{ id: string }>(
    `insert into public.clientes (org_id, razon_social, email)
     values ($1, $2, $3) returning id`,
    [orgId, `${MARCA_TEST} Cliente ${label} ${suffix}`, emailFor("cliente")],
  );
  const clienteId = cliente.rows[0].id;

  const operadorAuthId = randomUUID();
  const clienteAuthId = randomUUID();
  await insertAuthUser(tx, operadorAuthId, emailFor("auth-operador"));
  await insertAuthUser(tx, clienteAuthId, emailFor("auth-cliente"));

  const operadorUsuario = await tx.query<{ id: string }>(
    `insert into public.usuarios (org_id, auth_user_id, rol, nombre, email)
     values ($1, $2, 'operador', $3, $4) returning id`,
    [orgId, operadorAuthId, `Operador ${label}`, emailFor("usuario-operador")],
  );
  const operadorUsuarioId = operadorUsuario.rows[0].id;

  const clienteUsuario = await tx.query<{ id: string }>(
    `insert into public.usuarios (org_id, cliente_id, auth_user_id, rol, nombre, email)
     values ($1, $2, $3, 'cliente', $4, $5) returning id`,
    [orgId, clienteId, clienteAuthId, `Usuario Cliente ${label}`, emailFor("usuario-cliente")],
  );
  const clienteUsuarioId = clienteUsuario.rows[0].id;

  const apiKey = await tx.query<{ id: string }>(
    `insert into public.api_keys_cifradas
       (cliente_id, org_id, proveedor, alias, key_ciphertext, key_iv, key_auth_tag, key_last4)
     values ($1, $2, 'anthropic', 'principal', decode('deadbeef','hex'),
             decode('aabbcc','hex'), decode('112233','hex'), '9999')
     returning id`,
    [clienteId, orgId],
  );
  const apiKeyId = apiKey.rows[0].id;

  const agente = await tx.query<{ id: string }>(
    `insert into public.agentes (org_id, cliente_id, nombre, api_key_id)
     values ($1, $2, $3, $4) returning id`,
    [orgId, clienteId, `${MARCA_TEST} Agente ${label}`, apiKeyId],
  );
  const agenteId = agente.rows[0].id;

  const uso = await tx.query<{ id: string }>(
    `insert into public.registros_uso (org_id, cliente_id, agente_id, modelo, costo_estimado)
     values ($1, $2, $3, 'claude-3-5-sonnet', 100) returning id`,
    [orgId, clienteId, agenteId],
  );
  const registroUsoId = uso.rows[0].id;

  const susc = await tx.query<{ id: string }>(
    `insert into public.suscripciones (org_id, cliente_id, plan, monto)
     values ($1, $2, 'basico', 50000) returning id`,
    [orgId, clienteId],
  );
  const suscripcionId = susc.rows[0].id;

  const cobro = await tx.query<{ id: string }>(
    `insert into public.cobros (org_id, cliente_id, suscripcion_id, monto)
     values ($1, $2, $3, 50000) returning id`,
    [orgId, clienteId, suscripcionId],
  );
  const cobroId = cobro.rows[0].id;

  const ticket = await tx.query<{ id: string }>(
    `insert into public.tickets_reclamos (org_id, cliente_id, abierto_por, asunto)
     values ($1, $2, $3, $4) returning id`,
    [orgId, clienteId, clienteUsuarioId, `${MARCA_TEST} Duda de ${label}`],
  );
  const ticketId = ticket.rows[0].id;

  const mensajePublico = await tx.query<{ id: string }>(
    `insert into public.mensajes_ticket (org_id, ticket_id, autor_id, autor_rol, cuerpo, es_interno)
     values ($1, $2, $3, 'cliente', $4, false) returning id`,
    [orgId, ticketId, clienteUsuarioId, `Mensaje público de ${label}`],
  );
  const mensajePublicoId = mensajePublico.rows[0].id;

  const mensajeInterno = await tx.query<{ id: string }>(
    `insert into public.mensajes_ticket (org_id, ticket_id, autor_id, autor_rol, cuerpo, es_interno)
     values ($1, $2, $3, 'operador', $4, true) returning id`,
    [orgId, ticketId, operadorUsuarioId, `Nota interna de ${label} (jamás debe verla el cliente)`],
  );
  const mensajeInternoId = mensajeInterno.rows[0].id;

  const audit = await tx.query<{ id: string }>(
    `insert into public.audit_log (org_id, actor_id, actor_rol, accion, entidad, entidad_id)
     values ($1, $2, 'operador', 'test.fixture.creado', 'ticket', $3) returning id`,
    [orgId, operadorUsuarioId, ticketId],
  );
  const auditLogId = audit.rows[0].id;

  return {
    label,
    orgId,
    clienteId,
    operadorAuthId,
    operadorUsuarioId,
    clienteAuthId,
    clienteUsuarioId,
    apiKeyId,
    agenteId,
    registroUsoId,
    suscripcionId,
    cobroId,
    ticketId,
    mensajePublicoId,
    mensajeInternoId,
    auditLogId,
  };
}

/**
 * Crea DOS orgs completas de fixture (A y B) dentro de la transacción dada.
 * Debe llamarse mientras la transacción todavía está como `postgres`
 * (recién abierta con RlsTx.begin(), antes de cualquier actAs()).
 */
export async function seedTwoOrgs(tx: RlsTx): Promise<TwoOrgFixtures> {
  const a = await seedOrg(tx, "A");
  const b = await seedOrg(tx, "B");
  return { a, b };
}
