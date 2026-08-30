import { createClient } from "@supabase/supabase-js";

/**
 * Cliente con `service_role`: bypassa RLS por completo. SOLO para operaciones
 * de Admin API (crear/invitar usuarios de Supabase Auth) que ningún rol de
 * Postgres puede hacer, ni siquiera el operador vía RLS normal.
 *
 * NUNCA importar este archivo desde un componente "use client" ni exponer
 * su resultado al navegador. Para leer/escribir filas de negocio (clientes,
 * usuarios, etc.) usar siempre `crearClienteServidor()` (respeta RLS) — la
 * autorización real de "solo el operador puede inscribir clientes" la da esa
 * RLS, no un chequeo manual en el código de la ruta.
 */
export function crearClienteAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
