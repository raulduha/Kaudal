import { StatusChip, ChipTone } from "./StatusChip";

export type EstadoKey = "valida" | "sin_key" | "invalida" | "validando";

// Tabla "Chip de estado de key" de docs/eng/05-frontend-operador.md §6 — fuente
// de verdad única, reutilizada tanto en ClientCard como en la futura ficha de cliente (§8).
export const estadoKeyConfig: Record<EstadoKey, { label: string; tone: ChipTone }> = {
  valida: { label: "Key OK", tone: "secondary" },
  sin_key: { label: "Sin key", tone: "accent-warm" },
  invalida: { label: "Key con error", tone: "danger" },
  validando: { label: "Validando…", tone: "primary" },
};

export function KeyStatusChip({ estado, className }: { estado: EstadoKey; className?: string }) {
  const cfg = estadoKeyConfig[estado];
  return <StatusChip tone={cfg.tone} label={cfg.label} pulse={estado === "validando"} className={className} />;
}
