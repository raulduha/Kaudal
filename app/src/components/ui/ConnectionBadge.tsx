import { StatusChip } from "./StatusChip";

export type EstadoConexion = "en_vivo" | "reconectando";

// docs/eng/05-frontend-operador.md §16: "Conectado: punto menta En vivo.
// Reconectando: punto naranjo Reconectando…"
// role="status" aria-live="polite": el estado cambia solo, sin foco del usuario —
// SC 4.1.3 Status Messages.
export function ConnectionBadge({ estado, className }: { estado: EstadoConexion; className?: string }) {
  return (
    <span role="status" aria-live="polite">
      {estado === "en_vivo" ? (
        <StatusChip tone="secondary" label="En vivo" pulse className={className} />
      ) : (
        <StatusChip tone="accent-warm" label="Reconectando…" pulse className={className} />
      )}
    </span>
  );
}
