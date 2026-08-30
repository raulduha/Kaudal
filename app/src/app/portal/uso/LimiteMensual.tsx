"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, useToast } from "@/components/ui";

export function LimiteMensual({ limiteActual }: { limiteActual: number | null }) {
  const router = useRouter();
  const { toast } = useToast();
  const [valor, setValor] = useState(limiteActual !== null ? String(limiteActual) : "");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(undefined);
    setEnviando(true);
    try {
      const monto = valor.trim() === "" ? null : Number(valor);
      if (monto !== null && (!Number.isFinite(monto) || monto < 0)) {
        setError("Ingresa un número mayor o igual a 0.");
        return;
      }
      const res = await fetch("/api/portal/limite-mensual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monto }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "No pudimos guardar tu límite.");
        return;
      }
      toast({
        variant: "success",
        title: "Listo",
        description: monto !== null ? `Tu límite mensual quedó en ${monto.toLocaleString("es-CL")} CLP.` : "Quitamos tu límite mensual.",
      });
      router.refresh();
    } catch {
      setError("No pudimos conectar. Intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={guardar} className="mt-3 flex items-end gap-3" noValidate>
      <Input
        label="Límite mensual (CLP)"
        type="number"
        min={0}
        placeholder="Sin configurar"
        value={valor}
        onChange={(e) => {
          setValor(e.target.value);
          if (error) setError(undefined);
        }}
        error={error}
        className="max-w-[220px]"
      />
      <Button type="submit" disabled={enviando}>
        {enviando ? "Guardando…" : "Guardar"}
      </Button>
    </form>
  );
}
