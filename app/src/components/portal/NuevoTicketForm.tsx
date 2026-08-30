"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Select, Textarea, useToast } from "@/components/ui";
import { SelectorArchivos } from "@/components/tickets/SelectorArchivos";

// Tarea 9.1 (docs/eng/06 §9 confirmación, docs/eng/08 §12 formulario). Sube
// por multipart a POST /api/portal/tickets — el servidor hace todo el
// trabajo real (crear ticket, subir a Storage, primer mensaje); acá solo se
// arma el FormData y se valida lo mínimo antes de enviar, sin duplicar la
// validación de extensión/tamaño que ya vive en `lib/tickets/adjuntos.ts`.
export function NuevoTicketForm() {
  const router = useRouter();
  const { toast } = useToast();

  const [tipo, setTipo] = useState<"duda" | "reclamo">("duda");
  const [asunto, setAsunto] = useState("");
  const [cuerpo, setCuerpo] = useState("");
  const [archivos, setArchivos] = useState<File[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError(undefined);
    setEnviando(true);
    try {
      const form = new FormData();
      form.set("tipo", tipo);
      form.set("asunto", asunto);
      form.set("cuerpo", cuerpo);
      for (const archivo of archivos) form.append("archivos", archivo);

      const res = await fetch("/api/portal/tickets", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "No pudimos crear tu ticket.");
        return;
      }
      toast({ variant: "success", title: "Listo, recibimos tu mensaje", description: "Tu operador te responde por acá mismo. Te avisamos apenas conteste." });
      router.push(`/portal/reclamos/${data.ticketId}`);
    } catch {
      setError("No pudimos conectar. Intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="mt-6 flex max-w-lg flex-col gap-5" noValidate>
      <Select
        label="¿Qué necesitas?"
        required
        value={tipo}
        onChange={(e) => setTipo(e.target.value as "duda" | "reclamo")}
        options={[
          { value: "duda", label: "Tengo una duda" },
          { value: "reclamo", label: "Quiero hacer un reclamo" },
        ]}
      />
      <Input
        label="Asunto"
        required
        maxLength={200}
        placeholder="Resume en una línea qué pasa"
        value={asunto}
        onChange={(e) => setAsunto(e.target.value)}
      />
      <Textarea
        label="Cuéntanos más"
        required
        maxLength={5000}
        rows={5}
        placeholder="Cuéntanos con calma qué esperabas y qué pasó"
        value={cuerpo}
        onChange={(e) => setCuerpo(e.target.value)}
      />

      <div>
        <span className="mb-1.5 block text-sm text-text-muted">Adjuntar archivos</span>
        <SelectorArchivos archivos={archivos} onArchivosChange={setArchivos} />
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <Button type="submit" disabled={enviando}>
        {enviando ? "Enviando…" : "Enviar"}
      </Button>
    </form>
  );
}
