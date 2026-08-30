import { StatusChip, ChipTone } from "./StatusChip";
import { KeyStatusChip, EstadoKey } from "./KeyStatusChip";
import { cn } from "@/lib/cn";

export type EstadoCobro = "al_dia" | "pendiente" | "vencido";

const estadoCobroConfig: Record<EstadoCobro, { label: string; tone: ChipTone }> = {
  al_dia: { label: "Al día", tone: "secondary" },
  pendiente: { label: "Pendiente", tone: "accent-warm" },
  vencido: { label: "Vencido", tone: "danger" },
};

export interface ClientCardProps {
  nombre: string;
  rut: string;
  agentesActivos: number;
  agentesTotal: number;
  usoMes: number;
  costoEstimadoClp: number;
  estadoKey: EstadoKey;
  estadoCobro: EstadoCobro;
  className?: string;
}

const formatoClp = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });

/** Fila/tarjeta de cliente de docs/eng/05-frontend-operador.md §6 (`ClientsTable`). */
export function ClientCard({
  nombre,
  rut,
  agentesActivos,
  agentesTotal,
  usoMes,
  costoEstimadoClp,
  estadoKey,
  estadoCobro,
  className,
}: ClientCardProps) {
  const cobro = estadoCobroConfig[estadoCobro];
  return (
    <article className={cn("rounded-lg border border-border bg-surface p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-text">{nombre}</h3>
          <p className="text-xs text-text-muted">{rut}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <KeyStatusChip estado={estadoKey} />
          <StatusChip tone={cobro.tone} label={cobro.label} />
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
        <div>
          <dt className="text-xs text-text-muted">Agentes</dt>
          <dd className="mt-0.5 text-sm font-semibold text-text">
            {agentesActivos}/{agentesTotal}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-text-muted">Uso (mes)</dt>
          <dd className="mt-0.5 text-sm font-semibold text-text">{usoMes.toLocaleString("es-CL")}</dd>
        </div>
        <div>
          <dt className="text-xs text-text-muted">Costo (estimado)</dt>
          <dd className="mt-0.5 text-sm font-semibold text-text">{formatoClp.format(costoEstimadoClp)}</dd>
        </div>
      </dl>
    </article>
  );
}
