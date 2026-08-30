import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { brand } from "@brand/brand.config";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { crearClienteServidor } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { TicketCard, TicketEstado, TicketTipo } from "@/components/ui/TicketCard";
import { HiloMensajes, type MensajeHilo } from "@/components/tickets/HiloMensajes";
import { ResponderTicket } from "@/components/tickets/ResponderTicket";
import { MarcarLeido } from "@/components/tickets/MarcarLeido";
import { CambiarEstadoMiTicket } from "@/components/tickets/CambiarEstadoMiTicket";
import { obtenerContextoPortal } from "@/lib/portal/contexto";
import { formatoTiempoRelativo } from "@/lib/formato/tiempo-relativo";
import type { AdjuntoGuardado } from "@/lib/tickets/adjuntos";

// Tarea 9.1 (docs/eng/08 §11): hilo del ticket, lado cliente. Sin controles
// de estado/prioridad (esos son solo del operador, docs/eng/08 §11 "en el
// portal del cliente, la barra inferior es solo el campo de texto +
// adjuntar"). No se resuelve el nombre real del autor vía `usuarios`: la RLS
// de esa tabla (`usuarios_self`) no deja a un cliente leer la fila de OTRO
// usuario (ni la del operador) — se usa `autor_rol`, ya denormalizado en el
// mensaje, para etiquetar "Tú" / "Soporte {marca}".
export default async function DetalleReclamoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const usuario = await obtenerUsuarioActual();
  if (!usuario || usuario.rol !== "cliente") {
    redirect("/login");
  }

  const supabase = await crearClienteServidor();
  const [contexto, { data: ticket }, { data: mensajes }] = await Promise.all([
    obtenerContextoPortal(),
    supabase
      .from("tickets_reclamos")
      .select("id, tipo, asunto, estado, ultimo_mensaje_en")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("mensajes_ticket")
      .select("id, autor_rol, cuerpo, es_interno, adjuntos, created_at")
      .eq("ticket_id", id)
      .order("created_at", { ascending: true }),
  ]);

  if (!ticket) {
    notFound();
  }

  const hilo: MensajeHilo[] = (mensajes ?? []).map((m) => ({
    id: m.id,
    autorRol: m.autor_rol as "cliente" | "operador",
    autorNombre: m.autor_rol === "operador" ? `Soporte ${brand.name}` : "Tú",
    cuerpo: m.cuerpo,
    esInterno: m.es_interno,
    adjuntos: (m.adjuntos ?? []) as AdjuntoGuardado[],
    creadoEn: m.created_at,
  }));

  return (
    <AppShell
      rol="cliente"
      activeId="dudas-reclamos"
      empresaNombre={contexto.empresaNombre}
      costoEstimadoClp={contexto.costoEstimadoClp}
      reclamosAbiertos={contexto.ticketsSinLeer}
    >
      <MarcarLeido ticketId={ticket.id} />
      <Link href="/portal/reclamos" className="-ml-2 inline-flex min-h-11 items-center rounded-md px-2 text-sm font-medium text-text-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        ← Dudas y reclamos
      </Link>

      <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <TicketCard
          asunto={ticket.asunto}
          tipo={ticket.tipo as TicketTipo}
          estado={ticket.estado as TicketEstado}
          antiguedad={`Última actividad: ${formatoTiempoRelativo(ticket.ultimo_mensaje_en)}`}
          className="flex-1"
        />
        <CambiarEstadoMiTicket ticketId={ticket.id} estado={ticket.estado} />
      </div>

      <div className="mt-6 rounded-xl border border-border bg-surface px-5">
        <HiloMensajes ticketId={ticket.id} mensajes={hilo} />
        {ticket.estado === "cerrado" && (
          <p className="border-t border-border pt-3 text-xs text-text-muted">
            Este ticket está cerrado. Si escribes de nuevo, lo reabrimos.
          </p>
        )}
        {/* Escribir sobre un ticket "cerrado"/"respondido" lo reabre solo (trigger
            app.mensajes_aplicar_en_ticket) — no se oculta el formulario. */}
        <ResponderTicket ticketId={ticket.id} />
      </div>
    </AppShell>
  );
}
