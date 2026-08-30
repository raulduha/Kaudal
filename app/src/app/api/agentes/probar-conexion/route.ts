import { NextRequest } from "next/server";
import { z } from "zod";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { esMismoOrigen } from "@/lib/auth/same-origin";
import { verificarLimiteGenerico } from "@/lib/auth/rate-limit";
import { probarConexionAgente, headerValorValido } from "@/lib/agentes/probar-conexion";

// Paso 2 del wizard (docs/eng/05 10, "TestConnectionButton"): probar SIN
// guardar nada todavia. El secreto de auth viaja en el body solo para este
// ping: nunca se persiste aca, nunca se loguea.
const Body = z
  .object({
    url: z.string().trim().url().refine((v) => v.startsWith("https://"), "La URL debe ser https."),
    authTipo: z.enum(["none", "bearer", "header_key"]),
    // El secreto termina dentro de una cabecera HTTP saliente: se acota al
    // field-value de HTTP (sin CR/LF/NUL) antes de tocar nada.
    authSecreto: z.string().trim().max(400).refine(headerValorValido).optional(),
    authHeaderNombre: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_-]{1,64}$/)
      .optional(),
  })
  .strict();

export async function POST(req: NextRequest) {
  // CSRF (mismo patron que /api/auth/* y /api/portal/api-keys): sin esto un
  // sitio hostil puede hacer que el navegador del operador con sesion dispare
  // fetch salientes desde el servidor de Kaudal (SSRF por interposita persona).
  if (!esMismoOrigen(req)) {
    return Response.json({ ok: false, error: "Solicitud no permitida." }, { status: 403 });
  }

  const usuario = await obtenerUsuarioActual();
  if (!usuario || usuario.rol !== "operador") {
    return Response.json({ ok: false, error: "No tienes permiso para hacer esto." }, { status: 403 });
  }

  // docs/eng/03 7: "POST /api/keys y /test: 10/min por org". Este ES el /test
  // de agentes, y sin tope es una maquina de escanear la red del servidor.
  const limite = verificarLimiteGenerico(`agentes-probar:${usuario.orgId}`, 10);
  if (!limite.permitido) {
    return Response.json(
      { ok: false, error: "Demasiadas pruebas seguidas. Espera un momento e intenta de nuevo." },
      { status: 429, headers: { "Retry-After": String(limite.retryAfterSeg) } }
    );
  }

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return Response.json({ ok: false, error: "Revisa los datos e intenta de nuevo." }, { status: 400 });
  }
  const { url, authTipo, authSecreto, authHeaderNombre } = parsed.data;

  if (authTipo === "header_key" && !authHeaderNombre) {
    return Response.json({ ok: false, error: "Falta el nombre del header." }, { status: 400 });
  }

  const resultado = await probarConexionAgente({ url, authTipo, authSecreto, authHeaderNombre });
  return Response.json(resultado);
}
