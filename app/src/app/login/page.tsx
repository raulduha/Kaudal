"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Input } from "@/components/ui";
import { brand } from "@brand/brand.config";

/**
 * `?next=` viene de la URL, o sea del atacante. Sin filtrar, `router.push(next)`
 * con una URL absoluta hace una navegación externa: link a la pantalla de login
 * REAL de Kaudal que, tras un login exitoso, deja al usuario en un clon que le
 * pide "reingresar la contraseña" o pegar su API key de Anthropic.
 * Solo se aceptan rutas internas ("/algo"), nunca "//evil.cl", "/\evil.cl"
 * ni esquemas raros.
 */
function rutaInternaSegura(valor: string | null): string {
  if (!valor) return "/";
  if (!valor.startsWith("/")) return "/";
  if (valor.startsWith("//") || valor.startsWith("/\\")) return "/";
  return valor;
}

function FormularioLogin() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [enviando, setEnviando] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(undefined);
    setEnviando(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "No pudimos iniciar sesión.");
        return;
      }
      const next = rutaInternaSegura(params.get("next"));
      router.push(next);
      router.refresh();
    } catch {
      setError("No pudimos conectar. Revisa tu conexión e intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-lg font-bold text-white">
            {brand.name.slice(0, 1)}
          </div>
          <h1 className="text-xl font-semibold text-text">{brand.name}</h1>
          <p className="mt-1 text-sm text-text-muted">Inicia sesión para continuar</p>
        </div>

        <form onSubmit={onSubmit} noValidate className="space-y-4 rounded-xl border border-border bg-surface p-6">
          <Input
            label="Correo"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={error ? " " : undefined}
          />
          <Input
            label="Contraseña"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={error}
          />
          <Button type="submit" className="w-full" disabled={enviando}>
            {enviando ? "Entrando…" : "Entrar"}
          </Button>
        </form>

        <p className="mt-4 text-center text-xs text-text-faint">
          ¿No tienes cuenta? Tu empresa se inscribe a través del equipo de {brand.name}.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <FormularioLogin />
    </Suspense>
  );
}
