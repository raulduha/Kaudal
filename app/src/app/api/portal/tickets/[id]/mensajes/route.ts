import { NextRequest } from "next/server";
import { z } from "zod";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { crearClienteServidor } from "@/lib/supabase/server";
import { verificarLimiteGenerico } from "@/lib/auth/rate-limit";
import { esMismoOrigen } from "@/lib/auth/same-origin";
import { MAX_ADJUNTOS, subirAdjuntosTicket, validarAdjunto } from "@/lib/tickets/adjuntos";
import { CUERPO_DEMASIADO_GRANDE, conCuerpoAcotado } from "@/lib/http/cuerpo-acotado";

const Campos = z.object({
  cuerpo: z.string().trim().min(1, "Escribe un mensaje.").max(5000),
  esInterno: z.enum(["true", "false"]).optional(),
});

// security-auditor (9.1, MEDIO-2): sin esto, `req.formData()` bufferea el
// body COMPLETO en memoria antes de que corra cualquier validación de
// tamaño — un solo archivo de varios GB puede tumbar el proceso entero (MVP
// de una sola instancia, docs/16) antes de llegar a `validarAdjunto`. 5
// archivos × 10 MiB + texto + overhead de multipart.
const MAX_CUERPO_BYTES = 56 * 1024 * 1024;
const RECHAZO_MUY_PESADO = {
  ok: false,
  error: "Tus archivos pesan demasiado. Máximo 5 archivos de 10 MB cada uno.",
} as const;

// Tarea 9.1/9.2: responder un ticket existente, del lado del cliente o del
// operador. La máquina de estados (abierto->en_proceso, respondido/cerrado
// ->abierto) y las marcas de leído las aplica la base sola (trigger
// `app.mensajes_aplicar_en_ticket`, migración 9.1/9.2) — este handler solo
// valida, sube adjuntos si hay, e inserta. RLS (`mensajes_participante_insert`)
// es quien de verdad impide escribir en un ticket ajeno o marcar
// `es_interno=true` si no eres operador; acá solo evitamos el viaje inútil.
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

  const limite = verificarLimiteGenerico(`tickets-mensajes:${usuario.id}`, 30);
  if (!limite.permitido) {
    return Response.json(
      { ok: false, error: "Espera un momento antes de enviar otro mensaje." },
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
    cuerpo: form.get("cuerpo"),
    esInterno: form.get("esInterno") ?? undefined,
  });
  if (!parsed.success) {
    return Response.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Revisa el mensaje." }, { status: 400 });
  }
  // Nota interna: solo tiene efecto si además la RLS deja pasar `es_interno=true`
  // (exige rol operador) — un cliente que mande esInterno=true igual queda
  // filtrado por la policy, esto es solo para no fingir la casilla en la UI del operador.
  const esInterno = usuario.rol === "operador" && parsed.data.esInterno === "true";
  const { cuerpo } = parsed.data;

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

  let adjuntos: Awaited<ReturnType<typeof subirAdjuntosTicket>> | null = null;
  if (archivos.length > 0) {
    // security-auditor (ALTO-1): un adjunto de nota interna tiene que caer
    // en la carpeta "interno" (RLS de storage.objects, no negociable acá) o
    // el cliente podría leerlo sacando su JWT y listando el bucket, aunque
    // mensajes_ticket sí se lo esconda.
    adjuntos = await subirAdjuntosTicket(supabase, usuario.orgId, ticketId, archivos, esInterno ? "interno" : "publico");
    if (!adjuntos.ok) {
      return Response.json({ ok: false, error: adjuntos.error }, { status: 502 });
    }
  }

  const { error } = await supabase.from("mensajes_ticket").insert({
    org_id: usuario.orgId,
    ticket_id: ticketId,
    autor_id: usuario.id,
    autor_rol: usuario.rol,
    cuerpo,
    es_interno: esInterno,
    adjuntos: adjuntos?.ok ? adjuntos.adjuntos : [],
  });

  if (error) {
    // 42501 = RLS denegó el INSERT: el ticket no es tuyo, no existe, o (si
    // llegara a pasar) alguien intentó insertar sin ser participante.
    if (error.code === "42501") {
      return Response.json({ ok: false, error: "No encontramos ese ticket." }, { status: 404 });
    }
    console.error("[POST /api/portal/tickets/:id/mensajes] insert falló", { ticketId, error: error.message });
    return Response.json({ ok: false, error: "No pudimos enviar tu mensaje. Intenta de nuevo." }, { status: 500 });
  }

  return Response.json({ ok: true }, { status: 201 });
}
