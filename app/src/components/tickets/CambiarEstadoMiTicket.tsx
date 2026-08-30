"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, useToast } from "@/components/ui";

// docs/eng/08 §11: "Acciones del cliente: Responder · Marcar como resuelto."
// Único cambio de estado que el cliente puede hacer (RPC
// `cambiar_estado_mi_ticket`, Fase 2): alterna abierto↔cerrado. El resto de
// los estados (en_proceso, respondido) los mueve el operador.
export function CambiarEstadoMiTicket({ ticketId, estado }: { ticketId: string; estado: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [enviando, setEnviando] = useState(false);

  const cerrado = estado === "cerrado";

  async function cambiar() {
    setEnviando(true);
    try {
      const res = await fetch(`/api/portal/tickets/${ticketId}/estado`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado: cerrado ? "abierto" : "cerrado" }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast({ variant: "danger", title: "No pudimos actualizar tu ticket", description: data.error });
        return;
      }
      router.refresh();
    } catch {
      toast({ variant: "danger", title: "No pudimos conectar", description: "Intenta de nuevo." });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Button variant="secondary" size="sm" onClick={cambiar} disabled={enviando}>
      {enviando ? "Actualizando…" : cerrado ? "Reabrir" : "Marcar como resuelto"}
    </Button>
  );
}
