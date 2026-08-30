import { StatusChip, ChipTone } from "./StatusChip";
import { EstadoClienteAgente } from "@/lib/agentes/estado-cliente";

const config: Record<EstadoClienteAgente, { label: string; tone: ChipTone }> = {
  funcionando: { label: "Funcionando", tone: "secondary" },
  sin_uso_reciente: { label: "Sin uso reciente", tone: "warning" },
  con_problemas: { label: "Con problemas", tone: "danger" },
};

/** Chip de estado en el vocabulario del CLIENTE (docs/eng/06 §5) — distinto de `AgenteEstadoChip`, que usa el vocabulario interno del operador. */
export function AgenteClienteEstadoChip({ estado, className }: { estado: EstadoClienteAgente; className?: string }) {
  const cfg = config[estado];
  return <StatusChip tone={cfg.tone} label={cfg.label} pulse={estado === "funcionando"} className={className} />;
}
