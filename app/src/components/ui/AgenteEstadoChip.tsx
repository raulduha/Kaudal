import { StatusChip, ChipTone } from "./StatusChip";

export type EstadoAgente = "activo" | "pausado" | "caido" | "archivado";

// docs/eng/05 §9: "Estado | Activo (menta) · Pausado · Error (danger)".
// Vocabulario real de public.agentes.estado (Fase 6) — distinto del
// AgentStatusChip genérico de Fase 1 (idle/working/done/...), que no calza
// con estos 4 valores de dominio.
export const estadoAgenteConfig: Record<EstadoAgente, { label: string; tone: ChipTone }> = {
  activo: { label: "Activo", tone: "secondary" },
  caido: { label: "Caído", tone: "danger" },
  pausado: { label: "Pausado", tone: "accent-warm" },
  archivado: { label: "Archivado", tone: "muted" },
};

export function AgenteEstadoChip({ estado, className }: { estado: EstadoAgente; className?: string }) {
  const cfg = estadoAgenteConfig[estado];
  return <StatusChip tone={cfg.tone} label={cfg.label} className={className} />;
}
