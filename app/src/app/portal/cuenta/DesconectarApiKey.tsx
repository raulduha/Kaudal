"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, useToast } from "@/components/ui";

// compliance-cl (tarea 5.1): el cliente no tenía forma de desconectar su key
// sin poner otra en su lugar (solo existía "reemplazar"). Aviso explícito de
// que esto NO revoca nada en el proveedor — es lo que compliance-cl marcó
// como el malentendido más riesgoso: "revocada acá" ≠ "revocada en Anthropic".
export function DesconectarApiKey({ id }: { id: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function desconectar() {
    setEnviando(true);
    try {
      const res = await fetch(`/api/portal/api-keys/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast({ variant: "danger", title: "No pudimos desconectar tu key", description: data.error });
        return;
      }
      router.refresh();
    } catch {
      toast({ variant: "danger", title: "No pudimos conectar", description: "Intenta de nuevo." });
    } finally {
      setEnviando(false);
      setConfirmando(false);
    }
  }

  if (!confirmando) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setConfirmando(true)}>
        Desconectar
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-danger/30 bg-surface-alt p-3 text-xs">
      <p className="text-text-muted">
        Kaudal deja de usar esta clave, pero <strong className="text-text">sigue activa</strong> en el
        proveedor hasta que tú la borres allá.
      </p>
      <div className="flex gap-2">
        <Button variant="danger" size="sm" onClick={desconectar} disabled={enviando}>
          {enviando ? "Desconectando…" : "Sí, desconectar"}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setConfirmando(false)} disabled={enviando}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
