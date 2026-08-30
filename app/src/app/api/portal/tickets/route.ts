import { NextRequest } from "next/server";
import { z } from "zod";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { crearClienteServidor } from "@/lib/supabase/server";
import { verificarLimiteGenerico } from "@/lib/auth/rate-limit";
import { esMismoOrigen } from "@/lib/auth/same-origin";
import { MAX_ADJUNTOS, subirAdjuntosTicket, validarAdjunto, type AdjuntoGuardado } from "@/lib/tickets/adjuntos";
import { CUERPO_DEMASIADO_GRANDE, conCuerpoAcotado } from "@/lib/http/cuerpo-acotado";

const Campos = z.object({
  tipo: z.enum(["duda", "reclamo"]),
  asunto: z.string().trim().min(1, "Escribe un asunto.").max(200),
  cuerpo: z.string().trim().min(1, "Cuéntanos qué pasó.").max(5000),
});

// security-auditor (9.1, MEDIO-2): igual que en .../mensajes/route.ts — sin
// esto, `req.formData()` bufferea el body completo en memoria antes de
// cualquier validación de tamaño.
const MAX_CUERPO_BYTES = 56 * 1024 * 1024;
const RECHAZO_MUY_PESADO = {
  ok: false,
  error: "Tus archivos pesan demasiado. Máximo 5 archivos de 10 MB cada uno.",
} as const;

// Tarea 9.1 (docs/eng/08 §12): formulario "Crear ticket" del portal cliente.
// El body viene por multipart (no JSON) porque hay archivos. La prioridad se
// deriva del tipo acá (docs/eng/08 §4: reclamo -> alta, duda -> normal); el
// cliente nunca la elige. El resto de la máquina de estados, el tope de 10
// tickets/hora y la auditoría del alta ya corren solos en la base
// (migración 9.1/9.2) — este handler no los reimplementa.
export async function POST(req: NextRequest) {
  if (!esMismoOrigen(req)) {
    return Response.json({ ok: false, error: "Solicitud no permitida." }, { status: 403 });
  }

  const usuario = await obtenerUsuarioActual();
  if (!usuario || usuario.rol !== "cliente" || !usuario.clienteId) {
    return Response.json({ ok: false, error: "No tienes permiso para crear un ticket." }, { status: 403 });
  }

  const limite = verificarLimiteGenerico(`tickets:${usuario.clienteId}`, 10);
  if (!limite.permitido) {
    return Response.json(
      { ok: false, error: "Abriste varias solicitudes seguidas. Espera un momento." },
      { status: 429, headers: { "Retry-After": String(limite.retryAfterSeg) } }
    );
  }

  // `content-length` es un rechazo BARATO cuando el cliente lo declara mal a
  // propósito, pero nunca el único control: puede faltar (HTTP/2,
  // `Transfer-Encoding: chunked`) y `Number(null) === 0`, que ES finito —
  // sin el tope sobre el stream de abajo, esa rama nunca dispara. Ver
  // `lib/http/cuerpo-acotado.ts`.
  const declarado = req.headers.get("content-length");
  if (declarado !== null) {
    const n = Number(declarado);
    if (!Number.isFinite(n) || n < 0) {
      return Response.json({ ok: false, error: "No pudimos leer tu solicitud." }, { status: 400 });
    }
    if (n > MAX_CUERPO_BYTES) {
      return Response.json(RECHAZO_MUY_PESADO, { status: 413 });
    }
  }

  let form: FormData;
  try {
    form = await conCuerpoAcotado(req, MAX_CUERPO_BYTES).formData();
  } catch (e) {
    if (e instanceof Error && e.message === CUERPO_DEMASIADO_GRANDE) {
      return Response.json(RECHAZO_MUY_PESADO, { status: 413 });
    }
    return Response.json({ ok: false, error: "No pudimos leer tu solicitud." }, { status: 400 });
  }

  const parsed = Campos.safeParse({
    tipo: form.get("tipo"),
    asunto: form.get("asunto"),
    cuerpo: form.get("cuerpo"),
  });
  if (!parsed.success) {
    return Response.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Revisa los datos e intenta de nuevo." }, { status: 400 });
  }
  const { tipo, asunto, cuerpo } = parsed.data;

  const archivos = form.getAll("archivos").filter((f): f is File => f instanceof File && f.size > 0);
  if (archivos.length > MAX_ADJUNTOS) {
    return Response.json({ ok: false, error: `Máximo ${MAX_ADJUNTOS} archivos.` }, { status: 400 });
  }
  for (const archivo of archivos) {
    const validado = validarAdjunto(archivo.name, archivo.size);
    if (!validado.ok) {
      return Response.json({ ok: false, error: validado.error }, { status: 422 });
    }
  }

  const supabase = await crearClienteServidor();

  const { data: ticket, error: errorTicket } = await supabase
    .from("tickets_reclamos")
    .insert({
      org_id: usuario.orgId,
      cliente_id: usuario.clienteId,
      abierto_por: usuario.id,
      tipo,
      asunto,
      prioridad: tipo === "reclamo" ? "alta" : "normal",
    })
    .select("id")
    .single();

  if (errorTicket || !ticket) {
    if (errorTicket?.code === "PT429") {
      return Response.json({ ok: false, error: errorTicket.message }, { status: 429 });
    }
    console.error("[POST /api/portal/tickets] insert ticket falló", { orgId: usuario.orgId, error: errorTicket?.message });
    return Response.json({ ok: false, error: "No pudimos crear tu ticket. Intenta de nuevo." }, { status: 500 });
  }

  let adjuntos: AdjuntoGuardado[] = [];
  if (archivos.length > 0) {
    const resultado = await subirAdjuntosTicket(supabase, usuario.orgId, ticket.id, archivos);
    if (!resultado.ok) {
      // El ticket ya existe (sin mensaje todavía) — el cliente puede entrar y
      // escribir de nuevo desde el hilo. No intentamos una compensación
      // distribuida por un caso de baja probabilidad y autorrecuperable.
      return Response.json(
        { ok: false, error: resultado.error, ticketId: ticket.id },
        { status: 502 }
      );
    }
    adjuntos = resultado.adjuntos;
  }

  const { error: errorMensaje } = await supabase.from("mensajes_ticket").insert({
    org_id: usuario.orgId,
    ticket_id: ticket.id,
    autor_id: usuario.id,
    autor_rol: "cliente",
    cuerpo,
    es_interno: false,
    adjuntos,
  });

  if (errorMensaje) {
    console.error("[POST /api/portal/tickets] insert mensaje falló", { ticketId: ticket.id, error: errorMensaje.message });
    return Response.json(
      { ok: false, error: "Creamos tu ticket pero no pudimos guardar tu mensaje. Ábrelo y escríbelo de nuevo.", ticketId: ticket.id },
      { status: 502 }
    );
  }

  return Response.json({ ok: true, ticketId: ticket.id }, { status: 201 });
}
