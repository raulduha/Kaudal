"use client";

import Link from "next/link";
import { ComponentType, SVGProps } from "react";
import { cn } from "@/lib/cn";
import { Rol } from "@/components/ui/Badge";

export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Conteo visible en pastilla (ej. reclamos abiertos) — docs/eng/05 §3. */
  badgeCount?: number;
}

// Acento por rol (TASKS.md Fase 1.3): resalta el ítem activo y el detalle de marca
// del sidebar. Los colores semánticos globales (violeta=acción, menta=éxito,
// naranjo=alerta) de docs/eng/05 §2 se mantienen intactos en el resto de la UI.
// border-l-{color} (no border-{color}, que pintaría los 4 lados) para que solo
// el borde izquierdo tome el acento — el resto queda transparente.
const rolAccent: Record<Rol, { activeText: string; activeBg: string; activeBorder: string }> = {
  operador: { activeText: "text-accent-warm", activeBg: "bg-accent-warm/10", activeBorder: "border-l-accent-warm" },
  cliente: { activeText: "text-secondary", activeBg: "bg-secondary/10", activeBorder: "border-l-secondary" },
};

export interface SidebarProps {
  rol: Rol;
  items: NavItem[];
  activeId?: string;
  className?: string;
}

export function Sidebar({ rol, items, activeId, className }: SidebarProps) {
  const accent = rolAccent[rol];
  return (
    <nav aria-label="Navegación principal" className={cn("flex h-full flex-col gap-1 p-3", className)}>
      {items.map((item) => {
        const active = item.id === activeId;
        const Icon = item.icon;
        return (
          <Link
            key={item.id}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-md border border-transparent px-3 text-sm font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
              active ? cn(accent.activeText, accent.activeBg, accent.activeBorder, "border-l-2") : "text-text-muted hover:bg-surface-alt hover:text-text"
            )}
          >
            <Icon className="h-5 w-5 shrink-0" />
            <span className="flex-1">{item.label}</span>
            {!!item.badgeCount && (
              <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-pill bg-accent-warm px-1.5 py-0.5 text-xs font-semibold text-bg">
                {item.badgeCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
