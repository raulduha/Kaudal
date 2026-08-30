import { AppShell } from "@/components/layout/AppShell";
import { StatCard } from "@/components/ui/StatCard";

// Tarea 8.2 (docs/eng/06 §9: "Cargando datos" → "Buscando tus usos…"). Next.js
// muestra esto automáticamente mientras el Server Component de la ruta
// resuelve sus datos — antes de esta tarea no había ninguno bajo /portal, así
// que una consulta lenta dejaba la pantalla en blanco sin aviso. No recibe
// `empresaNombre`/`costoEstimadoClp` (todavía no hay datos que mostrar ahí)
// pero sí puede fijar `rol="cliente"`: es lo único que no depende de datos.
export default function PortalLoading() {
  return (
    <AppShell rol="cliente">
      <p className="text-text-muted">Buscando tus usos…</p>
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="" value="" loading />
        <StatCard label="" value="" loading />
        <StatCard label="" value="" loading />
        <StatCard label="" value="" loading />
      </div>
      <div className="mt-8 h-48 motion-safe:animate-pulse rounded-xl border border-border bg-surface" />
    </AppShell>
  );
}
