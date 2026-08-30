import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { OPCIONES_COOKIE_SESION } from "./cookie-options";

/**
 * Cliente de Supabase para Server Components, Server Actions y Route Handlers.
 * Lee/escribe la sesión en cookies HttpOnly del request actual.
 *
 * En un Server Component puro no se pueden escribir cookies (Next.js lo
 * prohíbe): el `catch` silencioso es intencional ahí. El middleware
 * (`src/lib/supabase/middleware.ts`) es quien realmente refresca y persiste
 * la sesión en cada request.
 */
export async function crearClienteServidor() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: OPCIONES_COOKIE_SESION,
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Component: no puede escribir cookies. El middleware lo cubre.
          }
        },
      },
    }
  );
}
