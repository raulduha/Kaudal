"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const [mensaje, setMensaje] = useState("Hola, ¿a qué hora abren?");
  const [resp, setResp] = useState<string>("");
  const [meta, setMeta] = useState<string>("");
  const [cargando, setCargando] = useState(false);

  async function cerrarSesion() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  async function correr() {
    setCargando(true); setResp(""); setMeta("");
    try {
      const r = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensaje }),
      });
      const data = await r.json();
      if (data.ok) {
        setResp(data.respuesta);
        setMeta((data.demo ? "modo demo · " : "") + "modelo: " + data.modelo);
      } else {
        setResp("Error: " + data.error);
      }
    } catch (e: any) {
      setResp("Error de red: " + (e?.message ?? "desconocido"));
    } finally {
      setCargando(false);
    }
  }

  return (
    <main className="wrap">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div className="brand"><span className="drop" />Kaudal</div>
        <button
          onClick={cerrarSesion}
          className="min-h-11 rounded-md border border-border px-3 text-sm text-text-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Cerrar sesión
        </button>
      </div>
      <p className="sub">Ruta 1 · Agente nativo en Mastra — la base e2e.</p>

      <div className="card">
        <span className="badge">Agente de Atención</span>
        <div style={{ marginTop: 14 }}>
          <label>Escríbele algo a tu agente</label>
          <textarea value={mensaje} onChange={(e) => setMensaje(e.target.value)} />
          <button onClick={correr} disabled={cargando}>
            {cargando ? "Pensando…" : "Probar agente"}
          </button>
        </div>
        {resp && <div className="resp">{resp}</div>}
        {meta && <div className="meta">{meta}</div>}
      </div>

      <div className="card">
        <strong>Siguiente:</strong>
        <p className="sub" style={{ margin: "8px 0 0 0" }}>
          Registrar el agente por cliente, mostrar su uso, conectar el cobro (Flow) y el portal del
          cliente. Specs en <code>docs/eng/</code>.
        </p>
      </div>
    </main>
  );
}
