import { NextRequest } from "next/server";
import { z } from "zod";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { crearClienteServidor } from "@/lib/supabase/server";
import { esMismoOrigen } from "@/lib/auth/same-origin";

const Body = z.object({ clienteId: z.string().uuid(), suscripcionId: z.string().uuid().optional(), proveedor: z.enum(["railway", "manual", "vps"]), url: z.string().url().startsWith("https://").optional().or(z.literal("")), costoMensualClp: z.number().nonnegative(), activar: z.boolean().default(false) }).strict();
export async function POST(req: NextRequest) {
  if (!esMismoOrigen(req)) return Response.json({ ok: false, error: "Solicitud no permitida." }, { status: 403 });
  const usuario = await obtenerUsuarioActual(); if (!usuario || usuario.rol !== "operador") return Response.json({ ok: false, error: "No tienes permiso." }, { status: 403 });
  const parsed = Body.safeParse(await req.json().catch(() => null)); if (!parsed.success) return Response.json({ ok: false, error: "Revisa los datos de la instancia." }, { status: 400 });
  const d = parsed.data; const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("instancias").insert({ org_id: usuario.orgId, cliente_id: d.clienteId, suscripcion_id: d.suscripcionId ?? null, proveedor: d.proveedor, url: d.url || null, costo_mensual_estimado_clp: d.costoMensualClp, estado: d.activar ? "activa" : "pendiente" }).select("id,estado").single();
  if (error || !data) return Response.json({ ok: false, error: d.activar ? "No se puede activar sin cobertura de suscripción." : "No pudimos registrar la instancia." }, { status: 400 });
  return Response.json({ ok: true, instancia: data });
}
