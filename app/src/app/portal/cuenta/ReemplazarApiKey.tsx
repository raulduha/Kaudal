"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";
import { ConectarApiKeyForm } from "@/components/portal/ConectarApiKeyForm";

// docs/eng/06 §3: "Reemplazar la key es posible en Mi cuenta, pero requiere
// volver a pegarla completa" — nunca una edición parcial.
export function ReemplazarApiKey() {
  const router = useRouter();
  const [editando, setEditando] = useState(false);

  if (!editando) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setEditando(true)}>
        Reemplazar API key
      </Button>
    );
  }

  return (
    <div className="mt-4 max-w-md">
      <ConectarApiKeyForm
        textoBoton="Guardar nueva key"
        onConectado={() => {
          setEditando(false);
          router.refresh();
        }}
      />
    </div>
  );
}
