import { Badge } from "./Badge";
import { StatusChip, ChipTone } from "./StatusChip";
import { cn } from "@/lib/cn";

// Vocabulario real de public.tickets_reclamos.estado (Fase 9) — la muestra
// original de 1.2 usaba abierto/en_curso/resuelto, que no existen en el
// esquema real (docs/eng/08 §3, mapeado al esquema real por db-guardian en la
// migración de 9.1/9.2: nuevo/reabierto→abierto, en_revision→en_proceso,
// resuelto→respondido, cerrado→cerrado).
export type TicketEstado = "abierto" | "en_proceso" | "respondido" | "cerrado";
export type TicketTipo = "duda" | "reclamo";

export const estadoTicketConfig: Record<TicketEstado, { label: string; tone: ChipTone }> = {
  abierto: { label: "Nuevo", tone: "accent-warm" },
  en_proceso: { label: "En proceso", tone: "primary" },
  respondido: { label: "Respondido", tone: "secondary" },
  cerrado: { label: "Cerrado", tone: "muted" },
};

const tipoLabel: Record<TicketTipo, string> = {
  duda: "Duda",
  reclamo: "Reclamo",
};

export interface TicketCardProps {
  asunto: string;
  /** Nombre de la empresa cliente — solo tiene sentido en la bandeja del operador (9.2), no en "Mis tickets" del cliente (9.1). */
  cliente?: string;
  tipo: TicketTipo;
  estado: TicketEstado;
  antiguedad: string;
  sinLeer?: boolean;
  className?: string;
}

/** Tarjeta de ticket, reutilizada en la bandeja del operador (9.2) y en "Mis tickets" del cliente (9.1) — docs/eng/05 §14 y docs/eng/08 §10/§12. */
export function TicketCard({ asunto, cliente, tipo, estado, antiguedad, sinLeer, className }: TicketCardProps) {
  return (
    <article className={cn("flex items-start gap-3 rounded-lg border border-border bg-surface p-4", className)}>
      <span
        className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", sinLeer ? "bg-primary" : "bg-transparent")}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-sm font-semibold text-text">{asunto}</h3>
          {sinLeer && <span className="sr-only">Mensaje sin leer</span>}
        </div>
        <p className="mt-0.5 text-xs text-text-muted">
          {cliente ? `${cliente} · ${antiguedad}` : antiguedad}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <StatusChip tone={estadoTicketConfig[estado].tone} label={estadoTicketConfig[estado].label} />
        <Badge tone="muted">{tipoLabel[tipo]}</Badge>
      </div>
    </article>
  );
}
