"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Textarea, useToast } from "@/components/ui";
import { SelectorArchivos } from "@/components/tickets/SelectorArchivos";

// Reutilizada en el hilo del cliente (9.1) y en el drawer del operador (9.2)
// — `mostrarNotaInterna` solo aparece del lado operador; el POST igual
// filtra por rol real de sesión (RLS decide, no esta prop).
export function ResponderTicket({ ticketId, mostrarNotaInterna = false }: { ticketId: string; mostrarNotaInterna?: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [cuerpo, setCuerpo] = useState("");
  const [archivos, setArchivos] = useState<File[]>([]);
  const [notaInterna, setNotaInterna] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!cuerpo.trim()) return;
    setError(undefined);
    setEnviando(true);
    try {
      const form = new FormData();
      form.set("cuerpo", cuerpo);
      if (mostrarNotaInterna && notaInterna) form.set("esInterno", "true");
      for (const archivo of archivos) form.append("archivos", archivo);

      const res = await fetch(`/api/portal/tickets/${ticketId}/mensajes`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "No pudimos enviar tu mensaje.");
        return;
      }
      setCuerpo("");
      setArchivos([]);
      setNotaInterna(false);
      router.refresh();
    } catch {
      setError("No pudimos conectar. Intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="mt-4 flex flex-col gap-3 border-t border-border pt-4" noValidate>
      <Textarea
        label="Escribe una respuesta"
        rows={3}
        placeholder={mostrarNotaInterna ? "Escribe una respuesta o una nota interna…" : "Escribe una respuesta…"}
        value={cuerpo}
        onChange={(e) => setCuerpo(e.target.value)}
      />
      <SelectorArchivos archivos={archivos} onArchivosChange={setArchivos} />
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex items-center justify-between gap-3">
        {mostrarNotaInterna ? (
          <label className="flex items-center gap-2 text-sm text-text-muted">
            <input
              type="checkbox"
              checked={notaInterna}
              onChange={(e) => setNotaInterna(e.target.checked)}
              className="h-4 w-4 rounded border-border text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            Nota interna (el cliente no la ve)
          </label>
        ) : (
          <span />
        )}
        <Button type="submit" disabled={enviando || !cuerpo.trim()}>
          {enviando ? "Enviando…" : "Enviar"}
        </Button>
      </div>
    </form>
  );
}
