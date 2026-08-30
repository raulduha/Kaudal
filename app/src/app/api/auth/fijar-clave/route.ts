import { NextRequest } from "next/server";
import { z } from "zod";
import { crearClienteServidor } from "@/lib/supabase/server";
import { esMismoOrigen } from "@/lib/auth/same-origin";

const Body = z.object({ password: z.string().min(12).max(200) });

/** Traduce los errores de GoTrue a español; nunca mostramos error.message crudo. */
function mensajeDeError(code: string | undefined): string {
  switch (code) {
    case "weak_password":
    case "validation_failed":
      return "Mínimo 12 caracteres, con mayúsculas, minúsculas y números.";
    case "same_password":
      return "Esa contraseña es igual a la anterior. Elige una distinta.";
    case "session_not_found":
    case "user_not_found":
    case "bad_jwt":
      return "Tu invitación ya no es válida. Pídele a quien te inscribió una invitación nueva.";
    case "over_request_rate_limit":
      return "Demasiados intentos. Espera un momento y vuelve a intentar.";
    default:
      return "No pudimos guardar tu contraseña. Intenta de nuevo.";
  }
}

export async function POST(req: NextRequest) {
  if (!esMismoOrigen(req)) {
    return Response.json({ ok: false, error: "Solicitud no permitida." }, { status: 403 });
  }

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: "Mínimo 12 caracteres, con mayúsculas, minúsculas y números." },
      { status: 400 }
    );
  }

  const supabase = await crearClienteServidor();

  // Requiere la sesión que dejó /auth/confirmar (verifyOtp). Sin sesión válida
  // no hay nada que actualizar — no es un 401 genérico de "necesitas iniciar
  // sesión" porque el usuario nunca pidió loguearse, vino de una invitación.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json(
      { ok: false, error: "Tu invitación ya no es válida. Pídele a quien te inscribió una invitación nueva." },
      { status: 401 }
    );
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    console.error("[POST /api/auth/fijar-clave] updateUser falló", error.code, error.message);
    return Response.json({ ok: false, error: mensajeDeError(error.code) }, { status: 400 });
  }

  return Response.json({ ok: true });
}
