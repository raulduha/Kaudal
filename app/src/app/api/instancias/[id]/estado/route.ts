import { NextRequest } from "next/server";
import { z } from "zod";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { crearClienteServidor } from "@/lib/supabase/server";
import { esMismoOrigen } from "@/lib/auth/same-origin";

const Body = z.object({ estado: z.enum(["activa", "suspendida"]) }).strict();
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!esMismoOrigen(req)) return Response.json({ ok: false, error: "Solicitud no permitida." }, { status: 403 });
  const { id } = await params; if (!z.string().uuid().safeParse(id).success) return Response.json({ ok: false, error: "No encontramos esa instancia." }, { status: 404 });
  const usuario = await obtenerUsuarioActual(); if (!usuario || usuario.rol !== "operador") return Response.json({ ok: false, error: "No tienes permiso para hacer esto." }, { status: 403 });
  const parsed = Body.safeParse(await req.json().catch(() => null)); if (!parsed.success) return Response.json({ ok: false, error: "Estado inválido." }, { status: 400 });
  const supabase = await crearClienteServidor(); const { error } = await supabase.from("instancias").update({ estado: parsed.data.estado }).eq("id", id);
  if (error) return Response.json({ ok: false, error: parsed.data.estado === "activa" ? "No se puede activar: revisa la suscripción y cobertura." : "No pudimos actualizar la instancia." }, { status: 400 });
  return Response.json({ ok: true, modo: "sandbox" });
}
