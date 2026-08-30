import { NextRequest } from "next/server";
import { z } from "zod";
import { crearClienteServidor } from "@/lib/supabase/server";
import { verificarLimiteLogin, registrarExitoLogin } from "@/lib/auth/rate-limit";
import { esMismoOrigen } from "@/lib/auth/same-origin";

const Body = z.object({
  // Los máximos evitan que alguien mande megabytes en el cuerpo (el hash de
  // la contraseña lo hace Supabase, pero el transporte y el parseo son nuestros).
  email: z.string().email().max(254),
  password: z.string().min(1).max(200),
});

// Mismo mensaje genérico para credenciales inválidas y para cuenta sin acceso a
// Kaudal: nunca revelar si un email está registrado (docs/eng/03 §5.3).
const ERROR_GENERICO = "Correo o contraseña incorrectos.";

/**
 * Piso de tiempo para las respuestas de credenciales inválidas. Sin esto,
 * "el correo no existe" (~85 ms) y "el correo existe, la clave está mala"
 * (~220 ms, porque ahí sí se verifica el hash) son distinguibles con un solo
 * request: un oráculo de enumeración de usuarios pese al mensaje genérico.
 */
const PISO_MS_RESPUESTA_FALLIDA = 450;

async function fallaCredenciales(inicio: number) {
  const restante = PISO_MS_RESPUESTA_FALLIDA - (Date.now() - inicio);
  if (restante > 0) await new Promise((r) => setTimeout(r, restante));
  return Response.json({ ok: false, error: ERROR_GENERICO }, { status: 401 });
}

export async function POST(req: NextRequest) {
  const inicio = Date.now();

  // CSRF: ver src/lib/auth/same-origin.ts (login forzado desde otro sitio).
  if (!esMismoOrigen(req)) {
    return Response.json({ ok: false, error: "Solicitud no permitida." }, { status: 403 });
  }

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return Response.json({ ok: false, error: ERROR_GENERICO }, { status: 400 });
  }
  const { email, password } = parsed.data;

  // Ojo: X-Forwarded-For es falsificable; el rate limit no depende solo de él
  // (hay además un bucket por correo). Ver src/lib/auth/rate-limit.ts.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const limite = verificarLimiteLogin(ip, email);
  if (!limite.permitido) {
    return Response.json(
      { ok: false, error: "Demasiados intentos. Espera un momento antes de volver a intentar." },
      { status: 429, headers: { "Retry-After": String(limite.retryAfterSeg) } }
    );
  }

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    // No distinguimos "no existe" de "clave mala" en la respuesta al cliente.
    return fallaCredenciales(inicio);
  }

  // Tener cuenta en Supabase Auth NO es tener acceso a Kaudal: el acceso lo da
  // una fila en public.usuarios, que solo crea el operador (docs/eng/03 §5.1,
  // "el cliente no se auto-registra"). Sin esta comprobación, cualquier
  // auth.users suelto (auto-registro, sobras de una migración, invitación a
  // medias) pasaba el gate y consumía /api/run.
  const { data: usuario, error: errorUsuario } = await supabase
    .from("usuarios")
    .select("rol")
    .eq("auth_user_id", data.user.id)
    .maybeSingle();

  if (errorUsuario || !usuario) {
    // Fail-closed: si no hay fila (o la consulta falla) no dejamos sesión abierta.
    await supabase.auth.signOut();
    return fallaCredenciales(inicio);
  }

  registrarExitoLogin(ip, email);
  return Response.json({ ok: true });
}
