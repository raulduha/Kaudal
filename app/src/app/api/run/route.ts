import { NextRequest } from "next/server";
import { z } from "zod";
import { agente, MODELO } from "@/mastra/agent";

const Body = z.object({ mensaje: z.string().min(1).max(2000) });

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return Response.json({ ok: false, error: "Falta el mensaje." }, { status: 400 });
  }
  const { mensaje } = parsed.data;

  // Modo DEMO: sin API key, la app funciona igual (para ver la ruta e2e sin gastar).
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({
      ok: true,
      demo: true,
      modelo: MODELO,
      respuesta:
        "(modo demo) Recibí tu mensaje: \"" + mensaje + "\". " +
        "Pon tu ANTHROPIC_API_KEY en .env.local para activar el agente real.",
    });
  }

  try {
    const res = await agente.generate(mensaje);
    return Response.json({ ok: true, demo: false, modelo: MODELO, respuesta: res.text });
  } catch (e: any) {
    return Response.json(
      { ok: false, error: "El agente falló: " + (e?.message ?? "error desconocido") },
      { status: 500 }
    );
  }
}
