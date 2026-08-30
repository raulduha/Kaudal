import type { NextRequest } from "next/server";

/**
 * Defensa CSRF para los endpoints POST de auth.
 *
 * `SameSite=Strict` evita que la cookie de sesión viaje en un request
 * cross-site (así que un "logout CSRF" no tiene sesión que cerrar), pero NO
 * evita el caso inverso: un formulario cross-site puede POSTear a /api/auth/login
 * con credenciales del atacante y el navegador SÍ guarda el Set-Cookie de la
 * respuesta (login forzado / fijación de sesión: la víctima queda operando
 * dentro de la cuenta del atacante sin darse cuenta).
 *
 * Nota: `Content-Type: application/json` tampoco protege — un form con
 * `enctype="text/plain"` puede fabricar un cuerpo JSON válido y
 * `Request.json()` lo parsea igual.
 *
 * Regla: si el request trae señales de navegador (`Sec-Fetch-Site` u `Origin`),
 * tienen que ser del mismo origen. Los clientes no-navegador (curl, jobs
 * server-to-server) no mandan ninguna de las dos y quedan permitidos: no
 * tienen cookies ambientes, así que no hay CSRF posible desde ahí.
 */
export function esMismoOrigen(req: NextRequest): boolean {
  const secFetchSite = req.headers.get("sec-fetch-site");
  if (secFetchSite && secFetchSite !== "same-origin" && secFetchSite !== "none") {
    return false;
  }

  const origin = req.headers.get("origin");
  if (!origin) return true;

  // Detrás de un proxy (Railway/Vercel) el Host interno no coincide con el
  // dominio público; el proxy sí setea x-forwarded-host.
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!host) return false;

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
