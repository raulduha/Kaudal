"use client";

import { useEffect } from "react";
import { useToast } from "@/components/ui/Toast";

// Tarea 8.2 (docs/eng/06 §9 y docs/07): "Sin conexión de internet" → "Parece
// que te quedaste sin conexión. Revisa tu internet." Global (operador y
// cliente) porque perder la conexión no es un concepto específico de un rol.
// No renderiza nada visible por sí mismo — solo escucha el evento del
// navegador y usa el sistema de toasts ya existente.
export function AvisoSinConexion() {
  const { toast } = useToast();

  useEffect(() => {
    function avisar() {
      toast({ variant: "warning", title: "Sin conexión", description: "Parece que te quedaste sin conexión. Revisa tu internet." });
    }
    window.addEventListener("offline", avisar);
    return () => window.removeEventListener("offline", avisar);
  }, [toast]);

  return null;
}
