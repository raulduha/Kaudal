"use client";

import { AppShell } from "@/components/layout/AppShell";
import { StatCard } from "@/components/ui/StatCard";
import { AgentCard } from "@/components/ui/AgentCard";
import { TicketCard } from "@/components/ui/TicketCard";

/**
 * Muestra del layout Cliente (Fase 1.3 de TASKS.md): acento menta, sidebar
 * de docs/eng/06 §2, badge de rol visible en el topbar.
 */
export default function DesignClientePage() {
  return (
    <AppShell
      rol="cliente"
      activeId="inicio"
      empresaNombre="Comercial Andes SpA"
      costoEstimadoClp={45000}
      conexion="en_vivo"
    >
      <h1 className="text-2xl font-bold text-text">Dónde se usa tu agente</h1>
      <p className="mt-1 text-text-muted">Esto es lo que pasó este mes.</p>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Usos este mes" value="1.240" variant="primary" />
        <StatCard label="Costo estimado" value="≈ $45.000" variant="secondary" hint="Estimado" />
        <StatCard label="Agentes activos" value="2 de 2" variant="secondary" />
        <StatCard label="Tickets abiertos" value={1} variant="accent-warm" />
      </div>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-text">Mis agentes</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <AgentCard nombre="Agente de cotizaciones" tipo="mastra" status="working" usoMes={820} actividad={[3, 5, 4, 7, 6, 9, 8]} />
          <AgentCard nombre="Agente de soporte" tipo="mastra" status="idle" usoMes={420} />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-text">Dudas y reclamos</h2>
        <div className="mt-3 grid gap-3">
          <TicketCard asunto="El agente de cotizaciones no responde" cliente="Comercial Andes" tipo="reclamo" estado="abierto" antiguedad="hace 4 h" sinLeer />
        </div>
      </section>
    </AppShell>
  );
}
