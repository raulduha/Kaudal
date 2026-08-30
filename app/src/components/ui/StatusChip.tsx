import { cn } from "@/lib/cn";
import { statusColors } from "@brand/brand.config";

export type ChipTone = "primary" | "secondary" | "warning" | "accent-warm" | "danger" | "muted" | "info";

const toneStyles: Record<ChipTone, { text: string; dot: string }> = {
  // text-primary-text (tinte AA de primary): #7C5CFF como texto acá da ~4.2:1, bajo AA.
  primary: { text: "border-primary/30 bg-primary/10 text-primary-text", dot: "bg-primary" },
  secondary: { text: "border-secondary/30 bg-secondary/10 text-secondary", dot: "bg-secondary" },
  warning: { text: "border-warning/30 bg-warning/10 text-warning", dot: "bg-warning" },
  // Naranjo "requiere atención" (docs/eng/05 §2) — distinto del ámbar `warning` de statusColors.updated.
  "accent-warm": { text: "border-accent-warm/30 bg-accent-warm/10 text-accent-warm", dot: "bg-accent-warm" },
  danger: { text: "border-danger/30 bg-danger/10 text-danger", dot: "bg-danger" },
  info: { text: "border-info/30 bg-info/10 text-info", dot: "bg-info" },
  muted: { text: "border-border bg-surface-alt text-text-muted", dot: "bg-text-faint" },
};

export interface StatusChipProps {
  tone: ChipTone;
  label: string;
  /** Punto que respira — para estados "en vivo" (ej. agente Trabajando). */
  pulse?: boolean;
  className?: string;
}

/**
 * Primitivo genérico: pastilla con punto de color + etiqueta.
 * No depende solo del color (siempre lleva texto) — docs/07-ux-y-diseno.md §5.
 */
export function StatusChip({ tone, label, pulse, className }: StatusChipProps) {
  const styles = toneStyles[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-0.5 text-xs font-medium",
        styles.text,
        className
      )}
    >
      <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
        {pulse && (
          <span
            className={cn(
              "absolute inline-flex h-full w-full motion-safe:animate-ping rounded-full opacity-75",
              styles.dot
            )}
          />
        )}
        <span className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", styles.dot)} />
      </span>
      {label}
    </span>
  );
}

type AgentStatus = keyof typeof statusColors;

const agentStatusTone: Record<AgentStatus, ChipTone> = {
  idle: "muted",
  working: "primary",
  done: "secondary",
  waiting: "info",
  updated: "warning",
  error: "danger",
};

/** Chip de estado de agente/nodo, usando statusColors de brand/brand.config.ts. */
export function AgentStatusChip({
  status,
  label,
  className,
}: {
  status: AgentStatus;
  label?: string;
  className?: string;
}) {
  return (
    <StatusChip
      tone={agentStatusTone[status]}
      label={label ?? statusColors[status].label}
      pulse={status === "working"}
      className={className}
    />
  );
}
