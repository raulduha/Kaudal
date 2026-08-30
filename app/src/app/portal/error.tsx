"use client";

import { useEffect } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";

// Tarea 8.2 (docs/eng/06 §9: "Error de carga" → "No pudimos cargar esto.
// Reintenta en un momento." + botón Reintentar). Los error boundaries de
// Next.js son obligatoriamente client components y no pueden volver a pedir
// sesión/datos server-side, así que —igual que loading.tsx— no recibe
// `empresaNombre`/`costoEstimadoClp`: mejor un topbar con el fallback "Tu
// empresa" que una pantalla en blanco o el error crudo de Next.
export default function PortalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <AppShell rol="cliente">
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-surface p-12 text-center">
        <h1 className="text-xl font-bold text-text">No pudimos cargar esto</h1>
        <p className="max-w-sm text-sm text-text-muted">Reintenta en un momento.</p>
        <Button variant="primary" onClick={reset} className="mt-1">
          Reintentar
        </Button>
      </div>
    </AppShell>
  );
}
