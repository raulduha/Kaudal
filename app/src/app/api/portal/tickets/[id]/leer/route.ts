import { NextRequest } from "next/server";
import { z } from "zod";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { crearClienteServidor } from "@/lib/supabase/server";
import { verificarLimiteGenerico } from "@/lib/auth/rate-limit";
import { esMismoOrigen } from "@/lib/auth/same-origin";

// Marca como leídos los mensajes de un ticket para quien llama. Única vía
// posible: `mensajes_ticket` no tiene GRANT ni policy de UPDATE para nadie
// (a propósito, migración 9.1/9.2) — el RPC `marcar_mensajes_leidos` es la
// única escritura permitida sobre esas dos columnas.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!esMismoOrigen(req)) {
    return Response.json({ ok: false, error: "Solicitud no permitida." }, { status: 403 });
  }

  const { id: ticketId } = await params;
  if (!z.string().uuid().safeParse(ticketId).success) {
    return Response.json({ ok: false, error: "No encontramos ese ticket." }, { status: 404 });
  }

  const usuario = await obtenerUsuarioActual();
  if (!usuario) {
    return Response.json({ ok: false, error: "Necesitas iniciar sesión." }, { status: 403 });
  }

  // security-auditor (BAJO-4): este endpoint hace un UPDATE masivo real vía
  // RPC — sin tope, cualquier sesión válida puede llamarlo sin límite.
  const limite = verificarLimiteGenerico(`tickets-leer:${usuario.id}`, 60);
  if (!limite.permitido) {
    return Response.json(
      { ok: false, error: "Espera un momento e intenta de nuevo." },
      { status: 429, headers: { "Retry-After": String(limite.retryAfterSeg) } }
    );
  }

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("marcar_mensajes_leidos", { p_ticket_id: ticketId });

  if (error) {
    return Response.json({ ok: false, error: "No encontramos ese ticket." }, { status: 404 });
  }

  return Response.json({ ok: true, marcados: data ?? 0 });
}
