"use client";

import { useMemo, useState } from "react";
import { Input, Select, Badge } from "@/components/ui";

interface Tarifa {
  modelo: string;
  proveedor: string;
  input_usd_por_1k: number;
  output_usd_por_1k: number;
  fx_usd_clp: number;
}

const NOMBRE_PROVEEDOR: Record<string, string> = { anthropic: "Anthropic", openai: "OpenAI", otro: "Otro" };

// Iconos de línea del veredicto — mismo estilo (stroke 1.5, viewBox 20) que
// app/src/components/layout/icons.tsx, en vez de emoji (✅/⚠️/⛔) para que se
// sienta parte del mismo sistema y no de una plantilla genérica.
function IconoCheck(props: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={props.className}>
      <path d="M4 10.5l3.5 3.5L16 5.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconoAlerta(props: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={props.className}>
      <path d="M10 3.5 2.5 16.5h15L10 3.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M10 8.25v3.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="10" cy="14.25" r="0.9" fill="currentColor" />
    </svg>
  );
}
function IconoInfo(props: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={props.className}>
      <circle cx="10" cy="10" r="7.25" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 9.25v4.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="10" cy="6.5" r="0.9" fill="currentColor" />
    </svg>
  );
}

const fmt = (n: number) => (Number.isFinite(n) ? "$" + Math.round(n).toLocaleString("es-CL") : "$0");
const fmt2 = (n: number) =>
  Number.isFinite(n)
    ? "$" + (Math.round(n * 100) / 100).toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "$0,00";

/**
 * Puerto a React de tools/calculadora-agentes.html (tarea 7.2). Misma
 * fórmula y misma UX (todo se recalcula al tipear, sin botón "calcular"),
 * pero el modelo elegido prellena USD/1k y tipo de cambio desde
 * public.model_pricing real (Fase 7.1) en vez de un array fijo en JS.
 * Es un simulador — no persiste nada ni llama a ningún endpoint.
 */
export function CalculadoraAgentes({ tarifas }: { tarifas: Tarifa[] }) {
  const modeloInicial = tarifas.find((t) => t.modelo === "claude-sonnet-4-5")?.modelo ?? tarifas[0]?.modelo ?? "";

  const [nombre, setNombre] = useState("Notas a mano → Excel");
  const [usos, setUsos] = useState(600);
  const [tin, setTin] = useState(1500);
  const [tout, setTout] = useState(700);
  const tarifaInicial = tarifas.find((t) => t.modelo === modeloInicial);
  const [modelo, setModelo] = useState(modeloInicial);
  const [pin, setPin] = useState(() => (tarifaInicial ? tarifaInicial.input_usd_por_1k * 1000 : 3)); // USD / 1M entrada
  const [pout, setPout] = useState(() => (tarifaInicial ? tarifaInicial.output_usd_por_1k * 1000 : 15));
  const [fx, setFx] = useState(() => tarifaInicial?.fx_usd_clp ?? 950);
  const [fijo, setFijo] = useState(8000);
  const [hs, setHs] = useState(2);
  const [vh, setVh] = useState(15000);
  const [com, setCom] = useState(3.5);
  const [mult, setMult] = useState(3);
  const [precioInput, setPrecioInput] = useState("");

  // Al elegir un modelo, prellena USD/1M (la tabla guarda por 1k) y el tipo
  // de cambio vigente — igual que el <select> del HTML original.
  function elegirModelo(id: string) {
    setModelo(id);
    const t = tarifas.find((x) => x.modelo === id);
    if (t) {
      setPin(t.input_usd_por_1k * 1000);
      setPout(t.output_usd_por_1k * 1000);
      setFx(t.fx_usd_clp);
    }
  }

  const r = useMemo(() => {
    const costoIAusd = usos * ((tin / 1e6) * pin + (tout / 1e6) * pout);
    const costoIA = costoIAusd * fx;
    const costoSop = hs * vh;
    const costoTot = costoIA + fijo + costoSop;
    const costoUso = usos > 0 ? costoTot / usos : 0;
    const sugerido = costoTot * mult;
    const precio = precioInput === "" ? sugerido : parseFloat(precioInput) || 0;
    const comMonto = precio * (com / 100);
    const ganancia = precio - comMonto - costoTot;
    const margen = precio > 0 ? (ganancia / precio) * 100 : 0;
    return { costoIA, costoSop, costoTot, costoUso, sugerido, precio, comMonto, ganancia, margen };
  }, [usos, tin, tout, pin, pout, fx, fijo, hs, vh, com, mult, precioInput]);

  // Tonos alineados a los tokens semánticos (no accent-warm: ese naranjo está
  // reservado para diferenciar el rol Operador — ver Badge.tsx `rolConfig` y
  // el comentario de StatusChip.tsx). El estado "ajustado" usa `warning`
  // (ámbar), igual que `--warn` en el simulador original.
  const veredicto =
    r.precio <= 0
      ? { texto: "Ingresa un precio o usa el sugerido", tono: "border-border bg-surface-alt text-text-faint", icono: IconoInfo }
      : r.margen >= 55
        ? { texto: `Buen negocio · margen ${Math.round(r.margen)}%`, tono: "border-secondary/30 bg-secondary/10 text-secondary", icono: IconoCheck }
        : r.margen >= 30
          ? { texto: `Ajustado · margen ${Math.round(r.margen)}% — sube precio o baja costo`, tono: "border-warning/30 bg-warning/10 text-warning", icono: IconoAlerta }
          : { texto: `No conviene aún · margen ${Math.round(r.margen)}%`, tono: "border-danger/30 bg-danger/10 text-danger", icono: IconoAlerta };

  return (
    <div>
      <h1 className="text-2xl font-bold text-text">Calculadora de economía por agente</h1>
      <p className="mt-1 text-text-muted">
        Pon cuánto se usa un agente al mes y mira al tiro cuánto te cuesta y cuánto cobrar. Valores en CLP.
      </p>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <div className="rounded-xl border border-border bg-surface p-5">
            <h2 className="mb-4 text-sm font-semibold text-text-muted">El agente</h2>
            <div className="space-y-4">
              <Input label="Nombre del agente" value={nombre} onChange={(e) => setNombre(e.target.value)} />
              <Input
                label="¿Cuántas veces se usa al mes?"
                type="number"
                min={0}
                value={usos}
                onChange={(e) => setUsos(Number(e.target.value) || 0)}
                helperText="Cada factura/consulta/documento procesado cuenta como 1 uso."
              />
              <div className="grid grid-cols-2 gap-3">
                <Input label="Tokens entrada / uso" type="number" min={0} value={tin} onChange={(e) => setTin(Number(e.target.value) || 0)} />
                <Input label="Tokens salida / uso" type="number" min={0} value={tout} onChange={(e) => setTout(Number(e.target.value) || 0)} />
              </div>
              <Select
                label="Modelo"
                options={tarifas.map((t) => ({ value: t.modelo, label: `${t.modelo} (${NOMBRE_PROVEEDOR[t.proveedor] ?? t.proveedor})` }))}
                value={modelo}
                onChange={(e) => elegirModelo(e.target.value)}
                helperText="Elige uno para prellenar el precio vigente — igual lo puedes editar."
              />
              <div className="grid grid-cols-2 gap-3">
                <Input label="USD / 1M entrada" type="number" step="0.01" value={pin} onChange={(e) => setPin(Number(e.target.value) || 0)} />
                <Input label="USD / 1M salida" type="number" step="0.01" value={pout} onChange={(e) => setPout(Number(e.target.value) || 0)} />
              </div>
              <Input label="Tipo de cambio (1 USD = ? CLP)" type="number" min={1} value={fx} onChange={(e) => setFx(Number(e.target.value) || 0)} />
            </div>
          </div>

          <div className="rounded-xl border border-border bg-surface p-5">
            <h2 className="mb-4 text-sm font-semibold text-text-muted">Costos y precio</h2>
            <div className="space-y-4">
              <Input
                label="Otros costos fijos del agente / mes (CLP)"
                type="number"
                min={0}
                value={fijo}
                onChange={(e) => setFijo(Number(e.target.value) || 0)}
                helperText="Parte proporcional de hosting, base de datos, proveedor de boletas, etc."
              />
              <div className="grid grid-cols-2 gap-3">
                <Input label="Horas de soporte / mes" type="number" min={0} value={hs} onChange={(e) => setHs(Number(e.target.value) || 0)} />
                <Input label="Valor de tu hora (CLP)" type="number" min={0} value={vh} onChange={(e) => setVh(Number(e.target.value) || 0)} />
              </div>
              <Input label="Comisión pasarela (Flow, %)" type="number" step="0.1" min={0} value={com} onChange={(e) => setCom(Number(e.target.value) || 0)} />
              <div>
                <label htmlFor="mult" className="mb-1.5 block text-sm text-text-muted">
                  Margen objetivo (múltiplo sobre costo)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    id="mult"
                    type="range"
                    min={1.5}
                    max={6}
                    step={0.5}
                    value={mult}
                    onChange={(e) => setMult(Number(e.target.value))}
                    aria-valuetext={`${mult}×`}
                    className="h-1.5 flex-1 cursor-pointer appearance-none rounded-pill bg-border accent-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
                  />
                  <span className="w-12 text-right text-sm text-text">{mult}×</span>
                </div>
                <p className="mt-1.5 text-xs text-text-muted">Precio sugerido = costo total × este múltiplo. 3× es un piso sano.</p>
              </div>
              <Input
                label="Precio que quieres cobrar / mes (CLP)"
                type="number"
                min={0}
                placeholder="déjalo vacío para usar el sugerido"
                value={precioInput}
                onChange={(e) => setPrecioInput(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="space-y-5 lg:sticky lg:top-6 lg:self-start">
          <div className={`flex items-center gap-2.5 rounded-md border px-4 py-3 text-sm font-semibold ${veredicto.tono}`}>
            <veredicto.icono className="h-5 w-5 shrink-0" />
            <span>{veredicto.texto}</span>
          </div>

          <div className="rounded-xl border border-border bg-gradient-to-br from-surface-alt to-surface p-5">
            <p className="text-xs uppercase tracking-wide text-text-faint">Precio sugerido / mes</p>
            <p className="mt-1.5 text-3xl font-extrabold text-primary-text">{fmt(r.sugerido)}</p>
            <p className="mt-1.5 text-xs text-text-faint">
              ≈ {fmt2(usos > 0 ? r.sugerido / usos : 0)} por uso · múltiplo {mult}× sobre costo
            </p>
          </div>

          <div className="rounded-xl border border-border bg-surface p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-text-muted">Desglose mensual</h2>
              <Badge tone="muted">{usos.toLocaleString("es-CL")} usos/mes</Badge>
            </div>
            <dl className="divide-y divide-border/60 text-sm">
              <div className="flex justify-between py-2.5"><dt className="text-text-muted">Costo de IA (modelo)</dt><dd className="text-text">{fmt(r.costoIA)}</dd></div>
              <div className="flex justify-between py-2.5"><dt className="text-text-muted">Otros costos fijos</dt><dd className="text-text">{fmt(fijo)}</dd></div>
              <div className="flex justify-between py-2.5"><dt className="text-text-muted">Soporte (tu tiempo)</dt><dd className="text-text">{fmt(r.costoSop)}</dd></div>
              <div className="flex justify-between py-2.5 font-semibold"><dt className="text-text">Costo total / mes</dt><dd className="text-secondary">{fmt(r.costoTot)}</dd></div>
              <div className="flex justify-between py-2.5"><dt className="text-text-muted">Costo por uso</dt><dd className="text-text">{fmt2(r.costoUso)} / uso</dd></div>
            </dl>
          </div>

          <div className="rounded-xl border border-border bg-surface p-5">
            <h2 className="mb-3 text-sm font-semibold text-text-muted">Si cobras el precio elegido</h2>
            <dl className="divide-y divide-border/60 text-sm">
              <div className="flex justify-between py-2.5"><dt className="text-text-muted">Precio usado / mes</dt><dd className="text-text">{fmt(r.precio)}</dd></div>
              <div className="flex justify-between py-2.5"><dt className="text-text-muted">− Comisión pasarela</dt><dd className="text-text">− {fmt(r.comMonto)}</dd></div>
              <div className="flex justify-between py-2.5"><dt className="text-text-muted">− Costo total</dt><dd className="text-text">− {fmt(r.costoTot)}</dd></div>
              <div className="flex justify-between py-2.5 font-semibold"><dt className="text-text">Ganancia / mes</dt><dd className="text-secondary">{fmt(r.ganancia)}</dd></div>
              <div className="flex justify-between py-2.5"><dt className="text-text-muted">Margen</dt><dd className="text-text">{Math.round(r.margen)}%</dd></div>
            </dl>
          </div>
        </div>
      </div>

      <p className="mt-6 max-w-3xl text-xs text-text-faint">
        Los precios de los modelos se cargan desde la tabla de tarifas de Kaudal (Fase 7.1) — edítalos acá si
        necesitas simular un cambio, pero eso no actualiza la tarifa real. Esta calculadora es una guía de
        decisión, no una cotización oficial. Los valores no consideran IVA (agrégalo al cobrar).
      </p>
    </div>
  );
}
