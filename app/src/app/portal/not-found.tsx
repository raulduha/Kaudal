import Link from "next/link";
import { redirect } from "next/navigation";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { obtenerContextoPortal } from "@/lib/portal/contexto";

// Hallazgo de `accesibilidad` en 8.1: sin este archivo, un `notFound()` desde
// cualquier ruta bajo /portal (ej. un agente ya no existe o no es del
// cliente) caía en el 404 genérico de Next.js — sin AppShell, sin nav, sin
// forma de volver salvo "atrás" del navegador. Este not-found queda dentro
// del segmento /portal, así que hereda el mismo chequeo de sesión/rol que el
// resto del portal antes de mostrar nada.
export default async function PortalNotFound() {
  const usuario = await obtenerUsuarioActual();
  if (!usuario || usuario.rol !== "cliente") {
    redirect("/login");
  }

  const contexto = await obtenerContextoPortal();

  return (
    <AppShell rol="cliente" empresaNombre={contexto.empresaNombre} costoEstimadoClp={contexto.costoEstimadoClp} reclamosAbiertos={contexto.ticketsSinLeer}>
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-surface p-12 text-center">
        <h1 className="text-xl font-bold text-text">No encontramos esa página</h1>
        <p className="max-w-sm text-sm text-text-muted">
          Puede que el enlace esté mal escrito o que ese agente ya no exista. Volvamos a un lugar conocido.
        </p>
        <Link href="/portal" className="mt-1">
          <Button variant="primary">Volver a Inicio</Button>
        </Link>
      </div>
    </AppShell>
  );
}
