"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, useToast } from "@/components/ui";

export function CerrarSesionBoton() {
  const router = useRouter();
  const { toast } = useToast();
  const [cerrando, setCerrando] = useState(false);

  async function cerrarSesion() {
    setCerrando(true);
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (!res.ok) {
        toast({
          variant: "danger",
          title: "No pudimos cerrar tu sesión",
          description: "Intenta de nuevo en unos segundos.",
        });
        return;
      }
      router.push("/login");
      router.refresh();
    } catch {
      toast({
        variant: "danger",
        title: "No pudimos conectar",
        description: "Revisa tu conexión e intenta de nuevo.",
      });
    } finally {
      setCerrando(false);
    }
  }

  return (
    <Button variant="secondary" onClick={cerrarSesion} disabled={cerrando}>
      {cerrando ? "Cerrando…" : "Cerrar sesión"}
    </Button>
  );
}
