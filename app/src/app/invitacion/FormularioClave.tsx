"use client";

import { FormEvent, useState } from "react";
import { Button, Input } from "@/components/ui";

const AYUDA_CLAVE = "Mínimo 12 caracteres, con mayúsculas, minúsculas y números.";

function claveDebil(v: string): boolean {
  return v.length < 12 || !/[a-z]/.test(v) || !/[A-Z]/.test(v) || !/[0-9]/.test(v);
}

export function FormularioClave() {
  const [password, setPassword] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [enviando, setEnviando] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(undefined);

    if (password !== confirmar) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    if (claveDebil(password)) {
      setError(AYUDA_CLAVE);
      return;
    }

    setEnviando(true);
    try {
      const res = await fetch("/api/auth/fijar-clave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "No pudimos guardar tu contraseña.");
        return;
      }
      // Navegación completa: el destino es un literal fijo, nunca un parámetro
      // de la URL (sin open redirect). Sirve además para que el middleware
      // corra en el servidor con la sesión ya activa.
      window.location.href = "/portal";
    } catch {
      setError("No pudimos conectar. Revisa tu conexión e intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <Input
        label="Nueva contraseña"
        type="password"
        autoComplete="new-password"
        required
        helperText={AYUDA_CLAVE}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={error ? " " : undefined}
        disabled={enviando}
      />
      <Input
        label="Confirma tu contraseña"
        type="password"
        autoComplete="new-password"
        required
        value={confirmar}
        onChange={(e) => setConfirmar(e.target.value)}
        error={error}
        disabled={enviando}
      />
      <Button type="submit" className="w-full" disabled={enviando}>
        {enviando ? "Entrando…" : "Guardar y entrar"}
      </Button>
    </form>
  );
}
