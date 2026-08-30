"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";

export function CambiarEstadoOperador({ ticketId, estado, prioridad }: { ticketId: string; estado: string; prioridad: string }) {
  const router = useRouter(); const [enviando, setEnviando] = useState(false);
  async function cambiar(cambio: { estado?: string; prioridad?: string }) {
    setEnviando(true);
    try { const res = await fetch(`/api/reclamos/${ticketId}/estado`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cambio) }); if (res.ok) router.refresh(); } finally { setEnviando(false); }
  }
  return <div className="flex flex-wrap gap-3"><label className="flex items-center gap-2 text-sm text-text-muted">Estado <select value={estado} onChange={(e) => cambiar({ estado: e.target.value })} disabled={enviando} className="min-h-11 rounded-md border border-border bg-surface px-3 text-text"><option value="abierto">Nuevo</option><option value="en_proceso">En proceso</option><option value="respondido">Respondido</option><option value="cerrado">Cerrado</option></select></label><label className="flex items-center gap-2 text-sm text-text-muted">Prioridad <select value={prioridad} onChange={(e) => cambiar({ prioridad: e.target.value })} disabled={enviando} className="min-h-11 rounded-md border border-border bg-surface px-3 text-text"><option value="alta">Alta</option><option value="normal">Normal</option><option value="baja">Baja</option></select></label></div>;
}
