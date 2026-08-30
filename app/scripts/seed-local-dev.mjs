// Crea cuentas de prueba (operador + cliente) en el Supabase LOCAL (Docker)
// para poder probar el login end-to-end sin construir todavía la pantalla
// de inscripción de clientes (Fase 4). Usa @supabase/supabase-js (Admin API,
// service_role) para crear los auth.users, y `pg` para las filas de negocio
// (orgs/clientes/usuarios) — mismo patrón de conexión directa que usan los
// tests de RLS en app/tests/rls/.
//
// SOLO PARA DESARROLLO LOCAL. No usar contra un proyecto de producción:
// las contraseñas quedan impresas en la consola a propósito.
//
// Uso: node scripts/seed-local-dev.mjs   (desde app/, con Supabase local corriendo)

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

config({ path: new URL("../.env.local", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DB_URL = process.env.SUPABASE_DB_URL;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !DB_URL) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_DB_URL en app/.env.local");
  process.exit(1);
}

const PASSWORD = "DevKaudal123!";
const ORG_NOMBRE = "Kaudal Demo";
const CLIENTE_RAZON_SOCIAL = "Empresa Demo SpA";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function crearOEncontrarAuthUser(email) {
  const { data: creado, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (!error) return creado.user.id;

  // Ya existe de una corrida anterior del script: lo buscamos.
  if (error.message?.toLowerCase().includes("already been registered") || error.status === 422) {
    const { data: lista, error: errLista } = await admin.auth.admin.listUsers();
    if (errLista) throw errLista;
    const existente = lista.users.find((u) => u.email === email);
    if (existente) return existente.id;
  }
  throw error;
}

async function main() {
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();

  try {
    const operadorAuthId = await crearOEncontrarAuthUser("operador@kaudal.local");
    const clienteAuthId = await crearOEncontrarAuthUser("cliente@kaudal.local");

    await client.query("begin");

    const { rows: orgRows } = await client.query(
      `insert into public.orgs (nombre) values ($1)
       on conflict do nothing
       returning id`,
      [ORG_NOMBRE]
    );
    let orgId = orgRows[0]?.id;
    if (!orgId) {
      const existente = await client.query("select id from public.orgs where nombre = $1", [ORG_NOMBRE]);
      orgId = existente.rows[0].id;
    }

    const { rows: clienteRows } = await client.query(
      `insert into public.clientes (org_id, razon_social)
       values ($1, $2)
       on conflict do nothing
       returning id`,
      [orgId, CLIENTE_RAZON_SOCIAL]
    );
    let clienteId = clienteRows[0]?.id;
    if (!clienteId) {
      const existente = await client.query(
        "select id from public.clientes where org_id = $1 and razon_social = $2",
        [orgId, CLIENTE_RAZON_SOCIAL]
      );
      clienteId = existente.rows[0].id;
    }

    await client.query(
      `insert into public.usuarios (org_id, cliente_id, auth_user_id, rol, nombre, email)
       values ($1, null, $2, 'operador', 'Operador Demo', 'operador@kaudal.local')
       on conflict (auth_user_id) do nothing`,
      [orgId, operadorAuthId]
    );

    await client.query(
      `insert into public.usuarios (org_id, cliente_id, auth_user_id, rol, nombre, email)
       values ($1, $2, $3, 'cliente', 'Cliente Demo', 'cliente@kaudal.local')
       on conflict (auth_user_id) do nothing`,
      [orgId, clienteId, clienteAuthId]
    );

    await client.query("commit");

    console.log("Listo. Cuentas de prueba (SOLO desarrollo local):");
    console.log(`  Operador -> operador@kaudal.local / ${PASSWORD}`);
    console.log(`  Cliente  -> cliente@kaudal.local  / ${PASSWORD}`);
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Error sembrando cuentas de prueba:", err);
  process.exit(1);
});
