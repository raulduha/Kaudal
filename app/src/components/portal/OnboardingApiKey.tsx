"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";
import { ConectarApiKeyForm } from "./ConectarApiKeyForm";

type Paso = "bienvenida" | "conectar" | "listo";

// docs/eng/06 §3: asistente de 3 pasos, el cliente no puede saltárselo
// (sin API key no hay uso que estimar).
export function OnboardingApiKey({ nombre }: { nombre: string | null }) {
  const router = useRouter();
  const [paso, setPaso] = useState<Paso>("bienvenida");

  return (
    <div className="mx-auto max-w-md py-10">
      {paso === "bienvenida" && (
        <div className="rounded-xl border border-border bg-surface p-8 text-center">
          <h1 className="text-xl font-bold text-text">¡Hola{nombre ? `, ${nombre}` : ""}! Bienvenido a Kaudal 👋</h1>
          <p className="mt-2 text-text-muted">
            En 2 minutos dejamos tu agente conectado y funcionando. Empecemos.
          </p>
          <Button className="mt-6 w-full" onClick={() => setPaso("conectar")}>
            Comenzar
          </Button>
        </div>
      )}

      {paso === "conectar" && (
        <div className="rounded-xl border border-border bg-surface p-8">
          <h1 className="text-xl font-bold text-text">Conecta tu API key</h1>
          <p className="mt-2 text-text-muted">Esto es lo único que necesitas para que tu agente empiece a funcionar.</p>
          <div className="mt-6">
            <ConectarApiKeyForm onConectado={() => setPaso("listo")} />
          </div>
        </div>
      )}

      {paso === "listo" && (
        <div className="rounded-xl border border-border bg-surface p-8 text-center">
          <h1 className="text-xl font-bold text-text">¡Todo conectado! 🎉</h1>
          <p className="mt-2 text-text-muted">
            Ya podemos empezar a mostrarte dónde y cuánto se usa tu agente. Los primeros datos aparecen a medida
            que tu agente trabaja.
          </p>
          <Button
            className="mt-6 w-full"
            onClick={() => {
              router.refresh();
            }}
          >
            Ir a mi panel
          </Button>
        </div>
      )}
    </div>
  );
}
