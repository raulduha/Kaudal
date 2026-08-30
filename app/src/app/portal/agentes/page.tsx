import Link from "next/link";
import { redirect } from "next/navigation";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { crearClienteServidor } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { ClientAgentCard } from "@/components/ui/ClientAgentCard";
import { obtenerContextoPortal, inicioDeMesIso } from "@/lib/portal/contexto";
import { obtenerAgentesConUsoDelMes } from "@/lib/portal/agentes-cliente";
import { calcularEstadoCliente } from "@/lib/agentes/estado-cliente";

// Tarea 8.1 (docs/eng/06 §5): "Mis agentes" — la lista completa, cada
// agente como tarjeta con su estado en el vocabulario del cliente. El
// detalle por agente (docs/eng/06 §5 "Detalle de un agente") vive en
// /portal/agentes/[id].
export default async function MisAgentesPage() {
  const usuario = await obtenerUsuarioActual();
  if (!usuario || usuario.rol !== "cliente") {
    redirect("/login");
  }

  const supabase = await crearClienteServidor();
  const inicioMes = inicioDeMesIso();
  const [contexto, agentes] = await Promise.all([
    obtenerContextoPortal(),
    obtenerAgentesConUsoDelMes(supabase, inicioMes),
  ]);

  return (
    <AppShell
      rol="cliente"
      activeId="mis-agentes"
      empresaNombre={contexto.empresaNombre}
      costoEstimadoClp={contexto.costoEstimadoClp}
      reclamosAbiertos={contexto.ticketsSinLeer}
    >
      <h1 className="text-2xl font-bold text-text">Mis agentes</h1>
      <p className="mt-1 text-text-muted">Los agentes que tu operador dejó funcionando para ti.</p>

      {agentes.length === 0 ? (
        <div className="mt-10 flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface p-12 text-center">
          <p className="font-semibold text-text">Todavía no tienes agentes conectados</p>
          <p className="mt-1 max-w-sm text-sm text-text-muted">
            Tu operador los está preparando. Apenas quede uno listo, aparecerá acá con su estado y su uso.
          </p>
          <Link href="/portal/reclamos" className="mt-4">
            <Button variant="secondary">Escribir a soporte</Button>
          </Link>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {agentes.map((a) => (
            <Link
              key={a.id}
              href={`/portal/agentes/${a.id}`}
              className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <ClientAgentCard
                nombre={a.nombre}
                modelo={a.modelo}
                estado={calcularEstadoCliente(a.estadoBackend, a.ultimaActividad)}
                usosMes={a.usosMes}
                costoMes={a.costoMes}
                ultimaActividad={a.ultimaActividad}
              />
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}
