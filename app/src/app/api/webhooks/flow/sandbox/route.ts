import { NextRequest } from "next/server";
import { z } from "zod";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { firmaWebhookValida } from "@/lib/cobros/sandbox";
import { estadoInstanciaTrasPago } from "@/lib/instancias/suspension";

const Body = z.object({ suscripcionId: z.string().uuid(), estado: z.enum(["pagado", "rechazado", "anulado"]), firma: z.string().regex(/^[a-f0-9]{64}$/i) }).strict();
export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null)); if (!parsed.success) return Response.json({ ok: false }, { status: 400 });
  const secreto = process.env.FLOW_SANDBOX_WEBHOOK_SECRET; const b = parsed.data;
  if (!secreto || !firmaWebhookValida(`${b.suscripcionId}:${b.estado}`, b.firma, secreto)) return Response.json({ ok: false }, { status: 401 });
  const admin = crearClienteAdmin();
  const { data: sub } = await admin.from("suscripciones").select("id,estado").eq("id", b.suscripcionId).maybeSingle(); if (!sub) return Response.json({ ok: true });
  const pagado = b.estado === "pagado";
  const estadoSub = pagado ? "activa" : "morosa";
  const periodoGraciaHasta = pagado ? null : new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
  const { error: errorSuscripcion } = await admin.from("suscripciones").update({ estado: estadoSub, periodo_gracia_hasta: periodoGraciaHasta }).eq("id", sub.id);
  if (errorSuscripcion) return Response.json({ ok: false, error: "No pudimos actualizar la suscripcion." }, { status: 500 });
  // Durante gracia se conserva activa. El cron firmado la suspende al vencer.
  if (!pagado) return Response.json({ ok: true, modo: "sandbox", periodoGraciaHasta });
  const { error: errorInstancias } = await admin.from("instancias").update({ estado: estadoInstanciaTrasPago(b.estado) }).eq("suscripcion_id", sub.id);
  if (errorInstancias) return Response.json({ ok: false, error: "No pudimos sincronizar las instancias." }, { status: 500 });
  return Response.json({ ok: true, modo: "sandbox" });
}
