import { NextRequest } from "next/server";
import { z } from "zod";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { crearClienteServidor } from "@/lib/supabase/server";
import { verificarLimiteGenerico } from "@/lib/auth/rate-limit";
import { esMismoOrigen } from "@/lib/auth/same-origin";

const Body = z.object({ ruta: z.string().min(1).max(500) }).strict();

// docs/eng/08 §7: "el frontend nunca recibe una URL pública fija: se
// entregan URLs firmadas de corta duración". La autorización real la da la
// RLS de `storage.objects` (`adjuntos_ticket_select`, migración 9.1/9.2) —
// este handler no repite ese chequeo de tenant/pertenencia, solo pide la
// URL firmada con el cliente de SESIÓN (nunca service_role): si la ruta no
// es tuya, `createSignedUrl` falla igual que cualquier otro acceso denegado.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!esMismoOrigen(req)) {
    return Response.json({ ok: false, error: "Solicitud no permitida." }, { status: 403 });
  }

  const { id: ticketId } = await params; // viaja en la URL solo por consistencia con el resto de /tickets/:id/*; la autorización real es por `ruta`.
  if (!z.string().uuid().safeParse(ticketId).success) {
    return Response.json({ ok: false, error: "No pudimos abrir ese archivo." }, { status: 404 });
  }

  const usuario = await obtenerUsuarioActual();
  if (!usuario) {
    return Response.json({ ok: false, error: "Necesitas iniciar sesión." }, { status: 403 });
  }

  // security-auditor (BAJO-4): sin tope, cualquier sesión válida puede pedir
  // URLs firmadas sin límite (trabajo real contra la Storage API cada vez).
  const limite = verificarLimiteGenerico(`tickets-firmar:${usuario.id}`, 60);
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
  const { data, error } = await supabase.storage
    .from("ticket-attachments")
    .createSignedUrl(parsed.data.ruta, 300); // 5 min, docs/eng/08 §7.

  if (error || !data) {
    return Response.json({ ok: false, error: "No pudimos abrir ese archivo." }, { status: 404 });
  }

  return Response.json({ ok: true, url: data.signedUrl });
}
