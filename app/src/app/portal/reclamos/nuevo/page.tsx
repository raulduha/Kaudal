import { redirect } from "next/navigation";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { AppShell } from "@/components/layout/AppShell";
import { NuevoTicketForm } from "@/components/portal/NuevoTicketForm";
import { obtenerContextoPortal } from "@/lib/portal/contexto";

export default async function NuevoReclamoPage() {
  const usuario = await obtenerUsuarioActual();
  if (!usuario || usuario.rol !== "cliente") {
    redirect("/login");
  }

  const contexto = await obtenerContextoPortal();

  return (
    <AppShell
      rol="cliente"
      activeId="dudas-reclamos"
      empresaNombre={contexto.empresaNombre}
      costoEstimadoClp={contexto.costoEstimadoClp}
      reclamosAbiertos={contexto.ticketsSinLeer}
    >
      <h1 className="text-2xl font-bold text-text">Nueva duda o reclamo</h1>
      <p className="mt-1 text-text-muted">Cuéntanos qué pasa. Te respondemos por acá.</p>
      <NuevoTicketForm />
    </AppShell>
  );
}
