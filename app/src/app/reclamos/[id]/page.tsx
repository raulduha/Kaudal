import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { crearClienteServidor } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { TicketCard, type TicketEstado, type TicketTipo } from "@/components/ui/TicketCard";
import { HiloMensajes, type MensajeHilo } from "@/components/tickets/HiloMensajes";
import { ResponderTicket } from "@/components/tickets/ResponderTicket";
import { MarcarLeido } from "@/components/tickets/MarcarLeido";
import { CambiarEstadoOperador } from "@/components/tickets/CambiarEstadoOperador";
import { formatoTiempoRelativo } from "@/lib/formato/tiempo-relativo";
import type { AdjuntoGuardado } from "@/lib/tickets/adjuntos";

export default async function DetalleReclamoOperador({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const usuario = await obtenerUsuarioActual();
  if (!usuario || usuario.rol !== "operador") redirect("/login");

  const supabase = await crearClienteServidor();
  const [{ data: ticket }, { data: mensajes }, { data: clientes }, { count: abiertos }] = await Promise.all([
    supabase.from("tickets_reclamos").select("id, cliente_id, asunto, tipo, estado, prioridad, ultimo_mensaje_en").eq("id", id).maybeSingle(),
    supabase.from("mensajes_ticket").select("id, autor_rol, cuerpo, es_interno, adjuntos, created_at").eq("ticket_id", id).order("created_at"),
    supabase.from("clientes").select("id, razon_social"),
    supabase.from("tickets_reclamos").select("id", { count: "exact", head: true }).neq("estado", "cerrado"),
  ]);
  if (!ticket) notFound();
  const cliente = (clientes ?? []).find((c) => c.id === ticket.cliente_id)?.razon_social ?? "Cliente";
  const hilo: MensajeHilo[] = (mensajes ?? []).map((m) => ({
    id: m.id, autorRol: m.autor_rol as "cliente" | "operador", autorNombre: m.autor_rol === "operador" ? "Tú" : cliente,
    cuerpo: m.cuerpo, esInterno: m.es_interno, adjuntos: (m.adjuntos ?? []) as AdjuntoGuardado[], creadoEn: m.created_at,
  }));

  return <AppShell rol="operador" activeId="reclamos" nombrePerfil={usuario.nombre ?? usuario.email} reclamosAbiertos={abiertos ?? 0}>
    <MarcarLeido ticketId={ticket.id} />
    <Link href="/reclamos" className="inline-flex min-h-11 items-center rounded-md px-2 text-sm font-medium text-text-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">← Reclamos y dudas</Link>
    <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center"><TicketCard className="flex-1" asunto={ticket.asunto} cliente={cliente} tipo={ticket.tipo as TicketTipo} estado={ticket.estado as TicketEstado} antiguedad={`Última actividad: ${formatoTiempoRelativo(ticket.ultimo_mensaje_en)}`} /><CambiarEstadoOperador ticketId={ticket.id} estado={ticket.estado} prioridad={ticket.prioridad} /></div>
    <div className="mt-6 rounded-xl border border-border bg-surface px-5"><HiloMensajes ticketId={ticket.id} mensajes={hilo} /><ResponderTicket ticketId={ticket.id} mostrarNotaInterna /></div>
  </AppShell>;
}
