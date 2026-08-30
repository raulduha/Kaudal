import { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type BadgeTone = "primary" | "secondary" | "accent-warm" | "danger" | "muted";

const toneStyles: Record<BadgeTone, string> = {
  // text-primary-text (tinte AA de primary) en vez de text-primary: #7C5CFF como texto
  // sobre este fondo tenue no alcanza 4.5:1.
  primary: "border-primary/30 bg-primary/10 text-primary-text",
  secondary: "border-secondary/30 bg-secondary/10 text-secondary",
  "accent-warm": "border-accent-warm/30 bg-accent-warm/10 text-accent-warm",
  danger: "border-danger/30 bg-danger/10 text-danger",
  muted: "border-border bg-surface-alt text-text-muted",
};

export interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}

/** Etiqueta estática (tipo de agente, tipo de ticket, etc.) — sin punto de estado. */
export function Badge({ tone = "muted", children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-pill border px-2.5 py-0.5 text-xs font-medium",
        toneStyles[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

export type Rol = "operador" | "cliente";

const rolConfig: Record<Rol, { label: string; tone: BadgeTone }> = {
  // Colores por rol definidos en TASKS.md Fase 1.3: operador = naranjo, cliente = menta.
  operador: { label: "Operador", tone: "accent-warm" },
  cliente: { label: "Cliente", tone: "secondary" },
};

export function RoleBadge({ rol, className }: { rol: Rol; className?: string }) {
  const { label, tone } = rolConfig[rol];
  return (
    <Badge tone={tone} className={className}>
      {label}
    </Badge>
  );
}
