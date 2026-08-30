"use client";

import { useState } from "react";

// docs/eng/08 §11: "Adjuntos como chips con ícono; al hacer click el backend
// entrega la URL firmada." El frontend nunca guarda ni recibe una URL
// pública — pide una firmada de 5 min cada vez que alguien hace click.
export function AdjuntoBoton({ ticketId, ruta, nombre }: { ticketId: string; ruta: string; nombre: string }) {
  const [cargando, setCargando] = useState(false);

  async function abrir() {
    setCargando(true);
    try {
      const res = await fetch(`/api/portal/tickets/${ticketId}/adjuntos/firmar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ruta }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        window.open(data.url, "_blank", "noopener,noreferrer");
      }
    } finally {
      setCargando(false);
    }
  }

  return (
    <button
      type="button"
      onClick={abrir}
      disabled={cargando}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-border bg-surface-alt px-3 text-xs font-medium text-text hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
    >
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-4 w-4 shrink-0">
        <path d="M13 3.5H6.5a1 1 0 00-1 1V15a1 1 0 001 1H14a1 1 0 001-1V7.5L13 3.5Z" />
        <path d="M12.5 3.5V7a1 1 0 001 1H17" />
      </svg>
      <span className="truncate max-w-[180px]">{cargando ? "Abriendo…" : nombre}</span>
    </button>
  );
}
