import { NextRequest } from "next/server";
import { z } from "zod";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { crearClienteServidor } from "@/lib/supabase/server";
import { esMismoOrigen } from "@/lib/auth/same-origin";

const Body = z.object({ monto: z.number().nonnegative().nullable() }).strict();

export async function POST(req: NextRequest) {
  if (!esMismoOrigen(req)) {
    return Response.json({ ok: false, error: "Solicitud no permitida." }, { status: 403 });
  }

  const usuario = await obtenerUsuarioActual();
  if (!usuario || usuario.rol !== "cliente") {
    return Response.json({ ok: false, error: "No tienes permiso para hacer esto." }, { status: 403 });
  }

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return Response.json({ ok: false, error: "Ingresa un monto válido." }, { status: 400 });
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("actualizar_limite_mensual_cliente", { p_monto: parsed.data.monto });

  if (error) {
    return Response.json({ ok: false, error: "No pudimos guardar tu límite. Intenta de nuevo." }, { status: 500 });
  }

  return Response.json({ ok: true });
}
