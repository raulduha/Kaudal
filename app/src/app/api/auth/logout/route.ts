import { NextRequest } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
import { esMismoOrigen } from "@/lib/auth/same-origin";

export async function POST(req: NextRequest) {
  if (!esMismoOrigen(req)) {
    return Response.json({ ok: false, error: "Solicitud no permitida." }, { status: 403 });
  }
  const supabase = await crearClienteServidor();
  await supabase.auth.signOut();
  return Response.json({ ok: true });
}
