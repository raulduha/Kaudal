import { NextRequest } from "next/server";
import { z } from "zod";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { crearClienteServidor } from "@/lib/supabase/server";

const Params = z.object({ id: z.string().uuid() });

// Para el paso 3 del wizard de registrar agente: qué keys tiene el cliente
// elegido, para poder asociar una (opcional). Solo metadatos — nunca ciphertext.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const usuario = await obtenerUsuarioActual();
  if (!usuario || usuario.rol !== "operador") {
    return Response.json({ ok: false, error: "No tienes permiso para ver esto." }, { status: 403 });
  }

  const parsed = Params.safeParse(await params);
  if (!parsed.success) {
    return Response.json({ ok: true, keys: [] });
  }

  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("api_keys_publicas")
    .select("id, proveedor, alias, key_last4")
    .eq("cliente_id", parsed.data.id)
    .eq("estado", "activa");

  return Response.json({ ok: true, keys: data ?? [] });
}
