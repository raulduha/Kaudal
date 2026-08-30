import { NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { crearClienteServidor } from "@/lib/supabase/server";

const TIPOS_VALIDOS: EmailOtpType[] = ["invite", "recovery", "email_change", "signup", "magiclink"];

/**
 * Canjea el `token_hash` de un link de invitación (u otro flujo OTP por
 * correo) por una sesión — SIEMPRE server-side. `verifyOtp()` corre sobre
 * `crearClienteServidor()`, así que la cookie de sesión queda `HttpOnly`
 * desde el primer instante: nunca pasa por un cliente de navegador ni por el
 * fragmento de la URL. Ver `supabase/templates/invite.html` (arma el link a
 * esta ruta) y `TASKS.md` 4.2 (hallazgo ALTO de `security-auditor`: el link
 * default de Supabase es de flujo implícito y `createBrowserClient` fuerza
 * PKCE — esa combinación nunca establecía sesión).
 */
export async function GET(req: NextRequest) {
  const tokenHash = req.nextUrl.searchParams.get("token_hash");
  const type = req.nextUrl.searchParams.get("type");

  if (!tokenHash || !type || !TIPOS_VALIDOS.includes(type as EmailOtpType)) {
    return Response.redirect(new URL("/invitacion?error=invalido", req.url));
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase.auth.verifyOtp({ type: type as EmailOtpType, token_hash: tokenHash });

  if (error) {
    return Response.redirect(new URL("/invitacion?error=invalido", req.url));
  }

  return Response.redirect(new URL("/invitacion", req.url));
}
