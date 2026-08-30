import Link from "next/link";
import { redirect } from "next/navigation";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { crearClienteServidor } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { TicketCard, type TicketEstado, type TicketTipo } from "@/components/ui/TicketCard";
import { formatoTiempoRelativo } from "@/lib/formato/tiempo-relativo";

const COLUMNAS: Array<{ estado: TicketEstado; titulo: string }> = [
  { estado: "abierto", titulo: "Nuevos" },
  { estado: "en_proceso", titulo: "En proceso" },
  { estado: "respondido", titulo: "Respondidos" },
  { estado: "cerrado", titulo: "Cerrados" },
];

export default async function ReclamosOperadorPage() {
  const usuario = await obtenerUsuarioActual();
  if (!usuario || usuario.rol !== "operador") redirect("/login");

  const supabase = await crearClienteServidor();
  const [{ data: tickets }, { data: clientes }] = await Promise.all([
    supabase
      .from("tickets_reclamos")
      .select("id, cliente_id, asunto, tipo, estado, ultimo_mensaje_en, prioridad_peso"),
    supabase.from("clientes").select("id, razon_social"),
  ]);
  const nombreCliente = new Map((clientes ?? []).map((c) => [c.id, c.razon_social]));
  const lista = tickets ?? [];
  const abiertos = lista.filter((ticket) => ticket.estado !== "cerrado").length;

  return (
    <AppShell rol="operador" activeId="reclamos" nombrePerfil={usuario.nombre ?? usuario.email} reclamosAbiertos={abiertos}>
      <div>
        <h1 className="text-2xl font-bold text-text">Reclamos y dudas</h1>
        <p className="mt-1 text-text-muted">Revisa y responde las solicitudes de tus clientes.</p>
      </div>

      {lista.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-border bg-surface p-12 text-center">
          <p className="font-semibold text-text">No tienes solicitudes pendientes.</p>
          <p className="mt-1 text-sm text-text-muted">Cuando un cliente escriba, aparecerá aquí.</p>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 xl:grid-cols-4">
          {COLUMNAS.map(({ estado, titulo }) => {
            const columna = lista
              .filter((ticket) => ticket.estado === estado)
              .sort((a, b) => (b.prioridad_peso ?? 0) - (a.prioridad_peso ?? 0) || new Date(a.ultimo_mensaje_en).getTime() - new Date(b.ultimo_mensaje_en).getTime());
            return (
              <section key={estado} aria-labelledby={`columna-${estado}`} className="rounded-xl border border-border bg-surface-alt/30 p-3">
                <div className="mb-3 flex items-center justify-between px-1">
                  <h2 id={`columna-${estado}`} className="text-sm font-semibold text-text">{titulo}</h2>
                  <span className="rounded-pill bg-surface px-2 py-0.5 text-xs text-text-muted">{columna.length}</span>
                </div>
                <div className="flex flex-col gap-3">
                  {columna.map((ticket) => (
                    <Link key={ticket.id} href={`/reclamos/${ticket.id}`} className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                      <TicketCard
                        asunto={ticket.asunto}
                        cliente={nombreCliente.get(ticket.cliente_id) ?? "Cliente"}
                        tipo={ticket.tipo as TicketTipo}
                        estado={ticket.estado as TicketEstado}
                        antiguedad={formatoTiempoRelativo(ticket.ultimo_mensaje_en)}
                      />
                    </Link>
                  ))}
                  {columna.length === 0 && <p className="px-1 py-4 text-sm text-text-muted">Sin solicitudes.</p>}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
