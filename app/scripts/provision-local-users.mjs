// Provisiona cuentas SOLO para Supabase local. Las credenciales se reciben por
// variables de entorno para no terminar guardadas en el repositorio.
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

config({ path: new URL("../.env.local", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1") });

const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: serviceKey, SUPABASE_DB_URL: dbUrl } = process.env;
const developer = { email: process.env.KAUDAL_DEVELOPER_EMAIL, password: process.env.KAUDAL_DEVELOPER_PASSWORD };
const customer = { email: process.env.KAUDAL_CLIENT_EMAIL, password: process.env.KAUDAL_CLIENT_PASSWORD };
if (!url?.match(/^http:\/\/(127\.0\.0\.1|localhost)/) || !serviceKey || !dbUrl || !developer.email || !developer.password || !customer.email || !customer.password) {
  throw new Error("Faltan variables de provisión local o el destino no es Supabase local.");
}

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

async function upsertAuth({ email, password }) {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  const existing = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
  if (existing) {
    const { error: updateError } = await admin.auth.admin.updateUserById(existing.id, { password, email_confirm: true });
    if (updateError) throw updateError;
    return existing.id;
  }
  const { data: created, error: createError } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (createError || !created.user) throw createError ?? new Error("No se pudo crear el usuario.");
  return created.user.id;
}

const db = new pg.Client({ connectionString: dbUrl });
await db.connect();
try {
  const [developerAuthId, customerAuthId] = await Promise.all([upsertAuth(developer), upsertAuth(customer)]);
  await db.query("begin");
  const org = await db.query("select id from public.orgs order by created_at asc limit 1");
  if (!org.rows[0]) throw new Error("No hay una organización local. Ejecuta primero el seed local.");
  const orgId = org.rows[0].id;
  const customerName = "Cliente de Prueba SpA";
  const existingCustomer = await db.query("select id from public.clientes where org_id = $1 and razon_social = $2 limit 1", [orgId, customerName]);
  const customerRow = existingCustomer.rows[0] ? existingCustomer : await db.query("insert into public.clientes (org_id, razon_social) values ($1, $2) returning id", [orgId, customerName]);
  const customerId = customerRow.rows[0].id;
  await db.query(
    `insert into public.usuarios (org_id, cliente_id, auth_user_id, rol, nombre, email)
     values ($1, null, $2, 'operador', 'Raúl Duha', $3)
     on conflict (auth_user_id) do update set org_id = excluded.org_id, cliente_id = null, rol = 'operador', nombre = excluded.nombre, email = excluded.email`,
    [orgId, developerAuthId, developer.email]
  );
  await db.query(
    `insert into public.usuarios (org_id, cliente_id, auth_user_id, rol, nombre, email)
     values ($1, $2, $3, 'cliente', 'Cliente de Prueba', $4)
     on conflict (auth_user_id) do update set org_id = excluded.org_id, cliente_id = excluded.cliente_id, rol = 'cliente', nombre = excluded.nombre, email = excluded.email`,
    [orgId, customerId, customerAuthId, customer.email]
  );
  await db.query("commit");
  console.log(`Operador local: ${developer.email}`);
  console.log(`Cliente local: ${customer.email}`);
} catch (error) {
  await db.query("rollback").catch(() => {});
  throw error;
} finally {
  await db.end();
}
