import { NextRequest } from "next/server";
import { z } from "zod";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { crearClienteServidor } from "@/lib/supabase/server";
import { verificarLimiteGenerico } from "@/lib/auth/rate-limit";
import { esMismoOrigen } from "@/lib/auth/same-origin";

const Body = z.object({ estado: z.enum(["abierto", "cerrado"]) }).strict();

// Único cambio de estado permitido al cliente (docs/eng/08 §11: "Marcar como
// resuelto"), vía el RPC `cambiar_estado_mi_ticket` (Fase 2) — no un UPDATE
// directo, para no abrirle una policy de escritura sobre toda la fila.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!esMismoOrigen(req)) {
    return Response.json({ ok: false, error: "Solicitud no permitida." }, { status: 403 });
  }

  const { id: ticketId } = await params;
  if (!z.string().uuid().safeParse(ticketId).success) {
    return Response.json({ ok: false, error: "No encontramos ese ticket." }, { status: 404 });
  }

  const usuario = await obtenerUsuarioActual();
  if (!usuario || usuario.rol !== "cliente") {
    return Response.json({ ok: false, error: "No tienes permiso para hacer esto." }, { status: 403 });
  }

  const limite = verificarLimiteGenerico(`tickets-estado:${usuario.id}`, 30);
  if (!limite.permitido) {
    return Response.json(
      { ok: false, error: "Espera un momento e intenta de nuevo." },
      { status: 429, headers: { "Retry-After": String(limite.retryAfterSeg) } }
    );
  }

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return Response.json({ ok: false, error: "Solicitud inválida." }, { status: 400 });
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("cambiar_estado_mi_ticket", {
    p_ticket_id: ticketId,
    p_estado: parsed.data.estado,
  });

  if (error) {
    // security-auditor (BAJO-1): solo los errores que el propio RPC lanza a
    // propósito (42501 "no tienes permiso"/"no encontramos el ticket",
    // 22023 "ya está abierto") son mensajes humanos pensados para mostrarse.
    // Cualquier otro código es un error interno de Postgres crudo — nunca
    // debe llegar a la cara de un dueño de PYME (regla de oro 1).
    const esperado = error.code === "42501" || error.code === "22023";
    if (!esperado) {
      console.error("[POST /api/portal/tickets/:id/estado] rpc falló", { ticketId, error: error.message });
    }
    return Response.json(
      { ok: false, error: esperado ? error.message : "No pudimos actualizar tu ticket. Intenta de nuevo." },
      { status: esperado ? 400 : 500 }
    );
  }

  return Response.json({ ok: true });
}
