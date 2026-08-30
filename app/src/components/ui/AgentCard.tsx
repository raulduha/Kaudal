import { Badge, BadgeTone } from "./Badge";
import { AgentStatusChip } from "./StatusChip";
import { statusColors } from "@brand/brand.config";
import { cn } from "@/lib/cn";

export type AgentTipo = "mastra" | "n8n" | "propio";
type AgentStatus = keyof typeof statusColors;

const tipoConfig: Record<AgentTipo, { label: string; tone: BadgeTone }> = {
  mastra: { label: "Mastra", tone: "primary" },
  n8n: { label: "n8n", tone: "secondary" },
  propio: { label: "Código propio", tone: "muted" },
};

function Sparkline({ valores }: { valores: number[] }) {
  const max = Math.max(...valores, 1);
  const puntos = valores
    .map((v, i) => {
      const x = (i / Math.max(valores.length - 1, 1)) * 100;
      const y = 24 - (v / max) * 24;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg viewBox="0 0 100 24" preserveAspectRatio="none" className="h-6 w-full text-primary" aria-hidden="true">
      <polyline points={puntos} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export interface AgentCardProps {
  nombre: string;
  tipo: AgentTipo;
  status: AgentStatus;
  cliente?: string;
  usoMes?: number;
  actividad?: number[];
  className?: string;
}

/** Tarjeta de "Mis agentes" de docs/07-ux-y-diseno.md §3.2. */
export function AgentCard({ nombre, tipo, status, cliente, usoMes, actividad, className }: AgentCardProps) {
  const inicial = nombre.trim().charAt(0).toUpperCase() || "?";
  return (
    <article className={cn("rounded-lg border border-border bg-surface p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-surface-alt text-sm font-bold text-primary-text">
            {inicial}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text">{nombre}</h3>
            {cliente && <p className="text-xs text-text-muted">{cliente}</p>}
          </div>
        </div>
        <Badge tone={tipoConfig[tipo].tone}>{tipoConfig[tipo].label}</Badge>
      </div>

      <div className="mt-4">
        <AgentStatusChip status={status} />
      </div>

      {actividad && actividad.length > 1 && (
        <div className="mt-4">
          <Sparkline valores={actividad} />
        </div>
      )}

      {usoMes !== undefined && (
        <p className="mt-3 text-xs text-text-muted">{usoMes.toLocaleString("es-CL")} usos este mes</p>
      )}
    </article>
  );
}
