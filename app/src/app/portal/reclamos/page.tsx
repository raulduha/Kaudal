import Link from "next/link";
import { redirect } from "next/navigation";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { crearClienteServidor } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { TicketCard, TicketEstado, TicketTipo } from "@/components/ui/TicketCard";
import { obtenerContextoPortal } from "@/lib/portal/contexto";
import { formatoTiempoRelativo } from "@/lib/formato/tiempo-relativo";

// Tarea 9.1 (docs/eng/08 §12): "Mis tickets" — tabla/cards con asunto, tipo,
// estado, última actividad. Sin kanban (eso es 9.2, del operador). RLS
// (`tickets_cliente_select`) ya filtra a los tickets del propio cliente.
export default async function MisReclamosPage() {
  const usuario = await obtenerUsuarioActual();
  if (!usuario || usuario.rol !== "cliente") {
    redirect("/login");
  }

  const supabase = await crearClienteServidor();
  const [contexto, { data: tickets }] = await Promise.all([
    obtenerContextoPortal(),
    supabase
      .from("tickets_reclamos")
      .select("id, tipo, asunto, estado, ultimo_mensaje_en")
      .order("ultimo_mensaje_en", { ascending: false }),
  ]);

  // Un ticket tiene mensaje sin leer si alguno de los suyos figura en el
  // contador global de arriba — se resuelve con una segunda consulta chica
  // (mismo filtro que obtenerContextoPortal) en vez de tocar esa función
  // genérica para que devuelva también los ids.
  const { data: sinLeer } = await supabase
    .from("mensajes_ticket")
    .select("ticket_id")
    .eq("leido_por_cliente", false)
    .eq("es_interno", false);
  const idsSinLeer = new Set((sinLeer ?? []).map((m) => m.ticket_id));

  const lista = tickets ?? [];

  return (
    <AppShell
      rol="cliente"
      activeId="dudas-reclamos"
      empresaNombre={contexto.empresaNombre}
      costoEstimadoClp={contexto.costoEstimadoClp}
      reclamosAbiertos={contexto.ticketsSinLeer}
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text">Dudas y reclamos</h1>
          <p className="mt-1 text-text-muted">Pregúntanos o cuéntanos si algo no cuadra. Te respondemos por acá.</p>
        </div>
        <Link href="/portal/reclamos/nuevo">
          <Button>+ Nueva duda o reclamo</Button>
        </Link>
      </div>

      {lista.length === 0 ? (
        <div className="mt-10 flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface p-12 text-center">
          <p className="font-semibold text-text">No tienes dudas ni reclamos abiertos 🎉</p>
          <p className="mt-1 max-w-sm text-sm text-text-muted">
            Si algo no cuadra —un número raro, un agente que no responde, una pregunta— escríbenos por acá. Te
            respondemos directo.
          </p>
          <Link href="/portal/reclamos/nuevo" className="mt-4">
            <Button>+ Nueva duda o reclamo</Button>
          </Link>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-3">
          {lista.map((t) => (
            <Link
              key={t.id}
              href={`/portal/reclamos/${t.id}`}
              className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <TicketCard
                asunto={t.asunto}
                tipo={t.tipo as TicketTipo}
                estado={t.estado as TicketEstado}
                antiguedad={formatoTiempoRelativo(t.ultimo_mensaje_en)}
                sinLeer={idsSinLeer.has(t.id)}
              />
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}
