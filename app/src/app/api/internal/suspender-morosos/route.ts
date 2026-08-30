import { NextRequest } from "next/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { firmaWebhookValida } from "@/lib/cobros/sandbox";

export async function POST(req: NextRequest) {
  const secreto = process.env.SUSPENSION_CRON_SECRET;
  const firma = req.headers.get("x-kaudal-signature") ?? "";
  if (!secreto || !firmaWebhookValida("suspender-morosos", firma, secreto)) return Response.json({ ok: false }, { status: 401 });
  const admin = crearClienteAdmin();
  const { data: suspendidas, error } = await admin.rpc("suspender_instancias_morosas_vencidas");
  if (error) return Response.json({ ok: false }, { status: 500 });
  return Response.json({ ok: true, suspendidas: Number(suspendidas ?? 0), modo: "sandbox" });
}
