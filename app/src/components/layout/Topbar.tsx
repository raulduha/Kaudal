"use client";

import { Ref } from "react";
import { Rol, RoleBadge } from "@/components/ui/Badge";
import { ConnectionBadge, EstadoConexion } from "@/components/ui/ConnectionBadge";
import { cn } from "@/lib/cn";

const formatoClp = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });

export interface TopbarProps {
  rol: Rol;
  conexion?: EstadoConexion;
  /** Operador: nombre de quien tiene la sesión. */
  nombrePerfil?: string;
  /** Cliente: nombre de la empresa (docs/eng/06 §2). */
  empresaNombre?: string;
  /** Cliente: costo estimado del mes, siempre visible (docs/eng/06 §2/§4). */
  costoEstimadoClp?: number;
  /** Abre el drawer de navegación en mobile (el botón solo se ve bajo md). */
  onOpenMenu?: () => void;
  /** Ref al botón, para devolver el foco acá cuando se cierra el drawer. */
  menuButtonRef?: Ref<HTMLButtonElement>;
  className?: string;
}

export function Topbar({
  rol,
  conexion = "en_vivo",
  nombrePerfil,
  empresaNombre,
  costoEstimadoClp,
  onOpenMenu,
  menuButtonRef,
  className,
}: TopbarProps) {
  const nombreVisible = nombrePerfil ?? empresaNombre;
  return (
    <header className={cn("flex h-16 items-center gap-4 border-b border-border bg-surface px-5", className)}>
      {onOpenMenu && (
        <button
          ref={menuButtonRef}
          type="button"
          onClick={onOpenMenu}
          aria-label="Abrir menú de navegación"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-surface-alt hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary md:hidden"
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" aria-hidden="true" className="h-5 w-5">
            <path d="M3 5.5h14M3 10h14M3 14.5h14" />
          </svg>
        </button>
      )}

      {rol === "operador" ? (
        <div className="min-w-0 flex-1">
          <label className="sr-only" htmlFor="buscador-global">
            Buscar cliente, agente o ticket
          </label>
          <input
            id="buscador-global"
            type="search"
            placeholder="Busca un cliente, agente o ticket…"
            className="min-h-11 w-full max-w-md rounded-md border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-text-muted focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
          />
        </div>
      ) : (
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-text">{empresaNombre ?? "Tu empresa"}</p>
          {costoEstimadoClp !== undefined && (
            <p className="text-xs text-text-muted">
              Costo estimado del mes: <span className="font-medium text-secondary">≈ {formatoClp.format(costoEstimadoClp)}</span>
            </p>
          )}
        </div>
      )}

      {/* ConnectionBadge es un concepto operativo (docs/eng/05 §16) — la topbar
          del cliente (docs/eng/06 §2) no lo pide, ese espacio queda para el
          badge de "respuesta nueva sin leer" cuando se construyan los tickets. */}
      {rol === "operador" && <ConnectionBadge estado={conexion} />}
      <RoleBadge rol={rol} />

      <div className="flex items-center gap-2 border-l border-border pl-4">
        <div
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-alt text-xs font-semibold text-text-muted"
        >
          {(nombreVisible ?? "?").trim().charAt(0).toUpperCase()}
        </div>
        <span className="sr-only text-sm text-text-muted sm:not-sr-only sm:inline">{nombreVisible}</span>
      </div>
    </header>
  );
}
