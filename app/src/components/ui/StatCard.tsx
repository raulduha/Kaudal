import { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type StatCardVariant = "primary" | "secondary" | "accent-warm";

const variantStyles: Record<StatCardVariant, string> = {
  primary: "text-primary",
  secondary: "text-secondary",
  "accent-warm": "text-accent-warm",
};

export interface StatCardProps {
  label: string;
  value: ReactNode;
  variant?: StatCardVariant;
  hint?: string;
  loading?: boolean;
  className?: string;
}

/** KPI card de docs/eng/05-frontend-operador.md §5 (`StatCard`). */
export function StatCard({ label, value, variant = "primary", hint, loading, className }: StatCardProps) {
  if (loading) {
    return (
      <div className={cn("rounded-lg border border-border bg-surface p-5", className)}>
        <div className="h-3.5 w-24 motion-safe:animate-pulse rounded bg-surface-alt" />
        <div className="mt-3 h-7 w-16 motion-safe:animate-pulse rounded bg-surface-alt" />
      </div>
    );
  }

  return (
    <div className={cn("rounded-lg border border-border bg-surface p-5", className)}>
      <p className="text-sm text-text-muted">{label}</p>
      <p className={cn("mt-1.5 text-2xl font-bold", variantStyles[variant])}>{value}</p>
      {hint && <p className="mt-1 text-xs text-text-muted">{hint}</p>}
    </div>
  );
}
