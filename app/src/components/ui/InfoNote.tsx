import { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface InfoNoteProps {
  children: ReactNode;
  className?: string;
}

/**
 * Nota informativa que transmite confianza (ej. "nunca vemos tu API key en texto
 * plano"). Usa el tono `info` de brand/brand.config.ts — a propósito distinto de
 * warning/danger porque no pide una acción, solo tranquiliza. Copy repetible donde
 * lo pide docs/eng/05-frontend-operador.md §7 y §19.
 */
export function InfoNote({ children, className }: InfoNoteProps) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-md border border-info/30 bg-info/10 p-4 text-sm text-text",
        className
      )}
    >
      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-info">
        <circle cx="10" cy="10" r="7.25" stroke="currentColor" strokeWidth="1.5" />
        <path d="M10 9.25v4.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="10" cy="6.5" r="0.9" fill="currentColor" />
      </svg>
      <p>{children}</p>
    </div>
  );
}
