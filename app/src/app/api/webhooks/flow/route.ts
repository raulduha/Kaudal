import { NextRequest } from "next/server";
import { z } from "zod";
import { firmaWebhookValida } from "@/lib/cobros/sandbox";

const Body = z.object({ token: z.string().min(8).max(200), firma: z.string().regex(/^[a-f0-9]{64}$/i) }).strict();

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false, error: "Webhook inválido." }, { status: 400 });
  const secreto = process.env.FLOW_SANDBOX_WEBHOOK_SECRET;
  if (!secreto) return Response.json({ ok: false, error: "Sandbox de Flow no configurado." }, { status: 503 });
  if (!firmaWebhookValida(parsed.data.token, parsed.data.firma, secreto)) return Response.json({ ok: false, error: "Firma inválida." }, { status: 401 });
  // El proveedor real se conecta aquí: consultar Flow con el token y aplicar
  // el cambio idempotente en cobros/suscripciones dentro de una transacción.
  return Response.json({ ok: true, modo: "sandbox" });
}
