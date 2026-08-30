import { StatusChip, ChipTone } from "./StatusChip";

export type EstadoCliente = "activo" | "suspendido" | "inactivo";

// Estados de public.clientes.estado (supabase/migrations/20260826125600_esquema_inicial.sql).
// Chip reutilizable para la columna "Estado" de docs/eng/05-frontend-operador.md §6
// mientras no existe el "Estado cobro" de la Fase de Cobros (necesita datos de facturación).
export const estadoClienteConfig: Record<EstadoCliente, { label: string; tone: ChipTone }> = {
  activo: { label: "Activo", tone: "secondary" },
  suspendido: { label: "Suspendido", tone: "danger" },
  inactivo: { label: "Inactivo", tone: "muted" },
};

export function ClientStatusChip({ estado, className }: { estado: EstadoCliente; className?: string }) {
  const cfg = estadoClienteConfig[estado] ?? estadoClienteConfig.inactivo;
  return <StatusChip tone={cfg.tone} label={cfg.label} className={className} />;
}
