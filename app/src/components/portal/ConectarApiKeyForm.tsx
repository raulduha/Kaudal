"use client";

import { FormEvent, useState } from "react";
import { Button, Input, Select } from "@/components/ui";
import { formatoValido, Proveedor } from "@/lib/proveedores/validar-api-key";

const OPCIONES_PROVEEDOR = [
  { value: "anthropic", label: "Anthropic" },
  { value: "openai", label: "OpenAI" },
  { value: "otro", label: "Otro" },
];

const NOMBRE_PROVEEDOR: Record<Proveedor, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  otro: "tu proveedor",
};

export interface ConectarApiKeyFormProps {
  /** Se llama cuando la key quedó guardada y verificada. */
  onConectado: () => void;
  textoBoton?: string;
}

export function ConectarApiKeyForm({ onConectado, textoBoton = "Conectar y continuar" }: ConectarApiKeyFormProps) {
  const [proveedor, setProveedor] = useState<Proveedor>("anthropic");
  const [key, setKey] = useState("");
  const [mostrarKey, setMostrarKey] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [enviando, setEnviando] = useState(false);

  const formatoOk = key.trim().length === 0 || formatoValido(proveedor, key);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(undefined);

    if (!formatoValido(proveedor, key)) {
      setError(`Esa clave no tiene el formato de ${proveedor}. Revísala.`);
      return;
    }

    setEnviando(true);
    try {
      const res = await fetch("/api/portal/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proveedor, key }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "No pudimos conectar con esa clave. ¿La copiaste completa?");
        return;
      }
      setKey("");
      onConectado();
    } catch {
      setError("No pudimos conectar. Revisa tu conexión e intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <Select
        label="Proveedor del modelo"
        options={OPCIONES_PROVEEDOR}
        value={proveedor}
        onChange={(e) => setProveedor(e.target.value as Proveedor)}
      />

      <div>
        <Input
          label="Tu API key"
          type={mostrarKey ? "text" : "password"}
          autoComplete="off"
          spellCheck={false}
          required
          value={key}
          onChange={(e) => setKey(e.target.value)}
          error={error ?? (!formatoOk ? `Esa clave no tiene el formato de ${proveedor}. Revísala.` : undefined)}
          helperText="La pegas una vez. Queda guardada cifrada y nunca la mostramos completa."
        />
        <button
          type="button"
          onClick={() => setMostrarKey((v) => !v)}
          className="mt-1.5 text-xs text-text-muted underline-offset-2 hover:text-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {mostrarKey ? "Ocultar clave" : "Mostrar clave"}
        </button>
      </div>

      <div className="flex items-start gap-2 rounded-md border border-border bg-bg p-3 text-xs text-text-muted">
        <span aria-hidden="true">🔒</span>
        <div className="space-y-1.5">
          <p>
            Tu clave viaja cifrada y se guarda cifrada. Ni Kaudal ni tu operador la ven en texto. La usamos para
            comprobar que funciona y para que tus agentes hablen con {NOMBRE_PROVEEDOR[proveedor]} a tu nombre —
            para eso se la enviamos a {NOMBRE_PROVEEDOR[proveedor]}, que está fuera de Chile. El consumo del
            modelo corre por tu cuenta, con tu clave.
          </p>
          <p>
            La guardamos mientras esté conectada. Si la reemplazas, Kaudal deja de usarla, pero sigue activa en{" "}
            {NOMBRE_PROVEEDOR[proveedor]} hasta que tú la borres allá.
          </p>
        </div>
      </div>

      <Button type="submit" className="w-full" disabled={enviando || key.trim().length === 0}>
        {enviando ? "Conectando…" : textoBoton}
      </Button>
    </form>
  );
}
