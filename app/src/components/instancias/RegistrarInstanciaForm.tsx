"use client";

import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";

type Cliente = { id: string; razon_social: string };
type Suscripcion = { id: string; cliente_id: string; estado: string; cubre_instancia: boolean };

export function RegistrarInstanciaForm({ clientes, suscripciones }: { clientes: Cliente[]; suscripciones: Suscripcion[] }) {
  const [clienteId, setClienteId] = useState("");
  const [suscripcionId, setSuscripcionId] = useState("");
  const [costo, setCosto] = useState("");
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [esError, setEsError] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const disponibles = suscripciones.filter((s) => s.cliente_id === clienteId);

  async function registrar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setEnviando(true); setMensaje(null); setEsError(false);
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/instancias", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      clienteId, suscripcionId: suscripcionId || undefined, proveedor: form.get("proveedor"), url: form.get("url"), costoMensualClp: Number(costo), activar: form.get("activar") === "on",
    }) });
    const data = await res.json().catch(() => null); setEnviando(false);
    if (!res.ok) { setEsError(true); setMensaje(data?.error ?? "No pudimos registrar la instancia."); return; }
    setMensaje("Instancia registrada."); setCosto(""); setSuscripcionId(""); e.currentTarget.reset();
  }

  return <form onSubmit={registrar} className="mt-6 grid gap-4 rounded-xl border border-border bg-surface p-4 md:grid-cols-2">
    <h2 className="md:col-span-2 text-lg font-semibold text-text">Registrar instancia manual</h2>
    <Select label="Cliente" required value={clienteId} onChange={(e) => { setClienteId(e.target.value); setSuscripcionId(""); }} placeholder="Selecciona un cliente" options={clientes.map((c) => ({ value: c.id, label: c.razon_social }))} />
    <Select label="Suscripción" value={suscripcionId} onChange={(e) => setSuscripcionId(e.target.value)} placeholder="Sin suscripción" options={disponibles.map((s) => ({ value: s.id, label: `${s.estado} · ${s.cubre_instancia ? "cubre instancia" : "sin cobertura"}` }))} />
    <Select label="Proveedor" name="proveedor" required options={[{ value: "manual", label: "Manual" }, { value: "railway", label: "Railway" }, { value: "vps", label: "VPS" }]} />
    <Input label="Costo mensual estimado (CLP)" required min="0" step="1" type="number" value={costo} onChange={(e) => setCosto(e.target.value)} />
    <Input label="URL de la instancia" name="url" type="url" placeholder="https://cliente.kaudal.cl" helperText="Opcional; debe usar HTTPS." />
    <label className="flex min-h-11 items-center gap-2 text-sm text-text"><input name="activar" type="checkbox" className="h-4 w-4 accent-primary" /> Activar ahora (requiere suscripción activa y cobertura)</label>
    <div className="md:col-span-2 flex flex-wrap items-center gap-3"><Button type="submit" disabled={enviando}>{enviando ? "Registrando…" : "Registrar instancia"}</Button>{mensaje && <p role={esError ? "alert" : "status"} className={esError ? "text-sm text-danger" : "text-sm text-text-muted"}>{mensaje}</p>}</div>
  </form>;
}
