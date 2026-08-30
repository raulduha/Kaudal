"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Select, Textarea, InfoNote, StatusChip } from "@/components/ui";
import { cn } from "@/lib/cn";

interface Cliente {
  id: string;
  razon_social: string;
}

interface ApiKeyDelCliente {
  id: string;
  proveedor: string;
  alias: string | null;
  key_last4: string | null;
}

type Paso = 1 | 2 | 3 | "listo";
type EstadoPing = "sin_probar" | "probando" | "conectado" | "no_responde";

const OPCIONES_TIPO = [
  { value: "mastra", label: "Mastra" },
  { value: "n8n", label: "n8n" },
  { value: "custom", label: "Propio (código a medida)" },
];
const OPCIONES_AUTH = [
  { value: "none", label: "Ninguna" },
  { value: "bearer", label: "Token Bearer" },
  { value: "header_key", label: "Header personalizado" },
];
const OPCIONES_CANAL = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "web", label: "Web" },
  { value: "api", label: "API" },
  { value: "otro", label: "Otro" },
];

const PASOS_WIZARD = [
  { n: 1, label: "Datos" },
  { n: 2, label: "Conexión" },
  { n: 3, label: "Medición" },
] as const;

export function RegistrarAgenteWizard({ clientes }: { clientes: Cliente[] }) {
  const router = useRouter();
  const [paso, setPaso] = useState<Paso>(1);

  // Paso 1
  const [clienteId, setClienteId] = useState("");
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");

  // Paso 2
  const [tipo, setTipo] = useState<"mastra" | "n8n" | "custom">("mastra");
  const [endpointUrl, setEndpointUrl] = useState("");
  const [healthUrl, setHealthUrl] = useState("");
  const [authTipo, setAuthTipo] = useState<"none" | "bearer" | "header_key">("none");
  const [authSecreto, setAuthSecreto] = useState("");
  const [authHeaderNombre, setAuthHeaderNombre] = useState("");
  const [estadoPing, setEstadoPing] = useState<EstadoPing>("sin_probar");
  const [errorPing, setErrorPing] = useState<string | undefined>();

  // Paso 3
  const [modeloDefault, setModeloDefault] = useState("");
  const [metodoReporte, setMetodoReporte] = useState<"estimado" | "reportado">("estimado");
  const [canal, setCanal] = useState("");
  const [apiKeyId, setApiKeyId] = useState("");
  const [keysCliente, setKeysCliente] = useState<ApiKeyDelCliente[]>([]);

  const [error, setError] = useState<string | undefined>();
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ nombre: string; ingestToken: string | null } | null>(null);

  useEffect(() => {
    if (!clienteId) {
      setKeysCliente([]);
      return;
    }
    fetch(`/api/clientes/${clienteId}/api-keys`)
      .then((r) => r.json())
      .then((d) => setKeysCliente(d.keys ?? []))
      .catch(() => setKeysCliente([]));
  }, [clienteId]);

  async function probarConexion() {
    setEstadoPing("probando");
    setErrorPing(undefined);
    try {
      const res = await fetch("/api/agentes/probar-conexion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: healthUrl || endpointUrl,
          authTipo,
          authSecreto: authTipo !== "none" ? authSecreto : undefined,
          authHeaderNombre: authTipo === "header_key" ? authHeaderNombre : undefined,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setEstadoPing("conectado");
      } else {
        setEstadoPing("no_responde");
        setErrorPing(data.error ?? "No pudimos llegar al endpoint. Revisa la URL o la autenticación.");
      }
    } catch {
      setEstadoPing("no_responde");
      setErrorPing("No pudimos conectar. Revisa tu conexión.");
    }
  }

  async function registrar() {
    setError(undefined);
    setEnviando(true);
    try {
      const res = await fetch("/api/agentes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clienteId,
          nombre,
          descripcion,
          tipo,
          endpointUrl,
          healthUrl: healthUrl || undefined,
          authTipo,
          authSecreto: authTipo !== "none" ? authSecreto : undefined,
          authHeaderNombre: authTipo === "header_key" ? authHeaderNombre : undefined,
          modeloDefault,
          metodoReporte,
          canal: canal || undefined,
          apiKeyId: apiKeyId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "No pudimos registrar el agente.");
        return;
      }
      setResultado({ nombre: data.agente.nombre, ingestToken: data.ingestToken });
      setPaso("listo");
    } catch {
      setError("No pudimos conectar. Revisa tu conexión e intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  if (paso === "listo" && resultado) {
    return (
      <div className="mx-auto max-w-lg py-10 text-center">
        <div className="rounded-xl border border-border bg-surface p-8">
          <h1 className="text-xl font-bold text-text">¡Todo conectado! 🎉</h1>
          <p className="mt-2 text-text-muted">
            Agente registrado. Ya aparece en el portal del cliente y empezamos a medir su uso.
          </p>

          {resultado.ingestToken && (
            <div className="mt-6 rounded-md border border-warning/30 bg-warning/10 p-4 text-left text-sm">
              <div className="flex items-start gap-2">
                <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-warning">
                  <path d="M10 3.5 2.5 16.5h15L10 3.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                  <path d="M10 8.25v3.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <circle cx="10" cy="14.25" r="0.9" fill="currentColor" />
                </svg>
                <div>
                  <p className="font-semibold text-text">Token de reporte de uso</p>
                  <p className="mt-1 text-xs text-warning">
                    Guárdalo ahora: no lo vamos a volver a mostrar. El agente lo usa para reportar sus usos a Kaudal.
                  </p>
                </div>
              </div>
              <code className="mt-3 block break-all rounded bg-bg p-2 text-xs text-text">
                {resultado.ingestToken}
              </code>
              <pre className="mt-3 overflow-x-auto rounded bg-bg p-2 text-xs text-text-muted">
{`curl -X POST https://tu-dominio/api/usage/events \\
  -H "Authorization: Bearer ${resultado.ingestToken}" \\
  -H "Content-Type: application/json" \\
  -d '{"units":1}'`}
              </pre>
            </div>
          )}

          <Button className="mt-6 w-full" onClick={() => router.push("/agentes")}>
            Ir a la lista de agentes
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl py-6">
      <h1 className="text-2xl font-bold text-text">Registrar agente</h1>
      <p className="mt-1 text-text-muted">
        Kaudal no lo ejecuta: lo apunta por endpoint y lo convierte en servicio medible.
      </p>

      <ol className="mt-6 flex items-center" aria-label="Progreso del registro">
        {PASOS_WIZARD.map((p, i) => {
          const pasoActual = typeof paso === "number" ? paso : 3;
          const completado = pasoActual > p.n;
          const activo = pasoActual === p.n;
          return (
            <li key={p.n} className="flex flex-1 items-center last:flex-none">
              <div className="flex items-center gap-2">
                <span
                  aria-current={activo ? "step" : undefined}
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                    completado
                      ? "bg-secondary/20 text-secondary"
                      : activo
                        ? "bg-primary-hover text-white"
                        : "border border-border bg-surface-alt text-text-muted"
                  )}
                >
                  {completado ? "✓" : p.n}
                </span>
                <span
                  className={cn(
                    "text-xs",
                    activo ? "font-semibold text-text" : completado ? "text-text-muted" : "text-text-faint"
                  )}
                >
                  {p.label}
                </span>
              </div>
              {i < PASOS_WIZARD.length - 1 && <span aria-hidden="true" className="mx-3 h-px flex-1 bg-border" />}
            </li>
          );
        })}
      </ol>

      <div className="mt-4 space-y-4 rounded-xl border border-border bg-surface p-6">
        {paso === 1 && (
          <>
            <Select
              label="Cliente"
              required
              placeholder="Elige un cliente"
              options={clientes.map((c) => ({ value: c.id, label: c.razon_social }))}
              value={clienteId}
              onChange={(e) => setClienteId(e.target.value)}
            />
            <Input label="Nombre del agente" required helperText="Visible para el cliente." value={nombre} onChange={(e) => setNombre(e.target.value)} />
            <Textarea label="Descripción" helperText="Qué hace, en simple." value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
            <div className="flex justify-end">
              <Button disabled={!clienteId || !nombre.trim()} onClick={() => setPaso(2)}>
                Siguiente
              </Button>
            </div>
          </>
        )}

        {paso === 2 && (
          <>
            <Select label="Tipo" options={OPCIONES_TIPO} value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)} />
            <Input label="URL del endpoint" required type="url" placeholder="https://…" value={endpointUrl} onChange={(e) => setEndpointUrl(e.target.value)} />
            <Input
              label="URL de healthcheck"
              type="url"
              placeholder="https://… (opcional)"
              helperText="Si la dejas vacía, probamos contra el endpoint de arriba."
              value={healthUrl}
              onChange={(e) => setHealthUrl(e.target.value)}
            />
            <Select label="Autenticación" options={OPCIONES_AUTH} value={authTipo} onChange={(e) => setAuthTipo(e.target.value as typeof authTipo)} />
            {authTipo !== "none" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label={authTipo === "bearer" ? "Token" : "Valor del header"}
                  type="password"
                  value={authSecreto}
                  onChange={(e) => setAuthSecreto(e.target.value)}
                  helperText="Se guarda cifrado. Nunca lo vas a volver a ver completo."
                />
                {authTipo === "header_key" && (
                  <Input
                    label="Nombre del header"
                    placeholder="X-API-Key"
                    value={authHeaderNombre}
                    onChange={(e) => setAuthHeaderNombre(e.target.value)}
                  />
                )}
              </div>
            )}

            <div>
              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" variant="secondary" onClick={probarConexion} disabled={!endpointUrl || estadoPing === "probando"}>
                  {estadoPing === "probando" ? "Probando…" : "Probar conexión"}
                </Button>
                {estadoPing === "probando" && <StatusChip tone="primary" label="Probando…" pulse />}
                {estadoPing === "conectado" && <StatusChip tone="secondary" label="Conectado" />}
                {estadoPing === "no_responde" && <StatusChip tone="danger" label="No responde" />}
              </div>
              {estadoPing === "conectado" && (
                <p className="mt-1.5 text-xs text-text-muted">Tu agente responde bien.</p>
              )}
              {estadoPing === "no_responde" && errorPing && (
                <p className="mt-1.5 text-xs text-danger">{errorPing}</p>
              )}
            </div>

            <div className="flex justify-between">
              <Button type="button" variant="ghost" onClick={() => setPaso(1)}>
                Atrás
              </Button>
              <Button disabled={!endpointUrl} onClick={() => setPaso(3)}>
                Siguiente
              </Button>
            </div>
          </>
        )}

        {paso === 3 && (
          <>
            <Input label="Modelo" placeholder="ej. claude-sonnet-4-5" helperText="Para estimar el costo por uso." value={modeloDefault} onChange={(e) => setModeloDefault(e.target.value)} />

            <div>
              <label className="mb-1.5 block text-sm text-text-muted">Modo de conteo</label>
              <div className="flex flex-col gap-2 text-sm text-text">
                <label className="flex items-center gap-2">
                  <input type="radio" checked={metodoReporte === "reportado"} onChange={() => setMetodoReporte("reportado")} />
                  Reportado por el agente
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" checked={metodoReporte === "estimado"} onChange={() => setMetodoReporte("estimado")} />
                  Estimado por Kaudal
                </label>
              </div>
            </div>

            <Select label="Canal" placeholder="Opcional" options={OPCIONES_CANAL} value={canal} onChange={(e) => setCanal(e.target.value)} />

            <Select
              label="API key del cliente"
              placeholder={keysCliente.length ? "Sin asignar" : "Este cliente todavía no conecta ninguna"}
              options={keysCliente.map((k) => ({ value: k.id, label: `${k.proveedor} ••••${k.key_last4 ?? "----"}${k.alias ? ` (${k.alias})` : ""}` }))}
              value={apiKeyId}
              onChange={(e) => setApiKeyId(e.target.value)}
              disabled={keysCliente.length === 0}
            />

            <InfoNote>
              Kaudal no intercepta las llamadas al modelo. El consumo corre por la API key del cliente. Acá solo
              estimamos o recibimos el conteo que reporta el agente.
            </InfoNote>

            {error && <p className="text-sm text-danger">{error}</p>}

            <div className="flex justify-between">
              <Button type="button" variant="ghost" onClick={() => setPaso(2)}>
                Atrás
              </Button>
              <Button onClick={registrar} disabled={enviando}>
                {enviando ? "Registrando…" : "Registrar agente"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
