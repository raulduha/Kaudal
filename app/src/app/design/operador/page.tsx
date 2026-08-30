"use client";

import { AppShell } from "@/components/layout/AppShell";
import { StatCard } from "@/components/ui/StatCard";
import { AgentCard } from "@/components/ui/AgentCard";
import { ClientCard } from "@/components/ui/ClientCard";
import { TicketCard } from "@/components/ui/TicketCard";

/**
 * Muestra del layout Operador (Fase 1.3 de TASKS.md): acento naranjo, sidebar
 * completo de docs/eng/05 §3, badge de rol visible en el topbar.
 */
export default function DesignOperadorPage() {
  return (
    <AppShell rol="operador" activeId="dashboard" nombrePerfil="Raúl" reclamosAbiertos={3} conexion="en_vivo">
      <h1 className="text-2xl font-bold text-text">Hola, Raúl. Esto es lo que está pasando hoy.</h1>
      <p className="mt-1 text-text-muted">Tienes 3 reclamos por responder y 1 cobro por vencer.</p>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Clientes activos" value={12} variant="primary" />
        <StatCard label="Agentes corriendo" value="18/20" variant="secondary" />
        <StatCard label="Uso del mes" value="4.820" variant="primary" />
        <StatCard label="Costo est. del mes" value="≈ $312.000" variant="secondary" hint="Estimado" />
        <StatCard label="Reclamos abiertos" value={3} variant="accent-warm" />
        <StatCard label="Cobros por vencer" value={1} variant="accent-warm" />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="text-lg font-semibold text-text">Agentes</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <AgentCard nombre="Agente de Cobranza" tipo="mastra" status="working" cliente="Comercial Andes" usoMes={342} />
            <AgentCard nombre="Cotizador" tipo="n8n" status="idle" cliente="ACME Ltda." usoMes={58} />
          </div>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-text">Reclamos recientes</h2>
          <div className="mt-3 grid gap-3">
            <TicketCard asunto="No me llegó la boleta de agosto" cliente="Comercial Andes" tipo="reclamo" estado="abierto" antiguedad="hace 4 h" sinLeer />
            <TicketCard asunto="¿Cómo cambio el tono del agente?" cliente="Ferretería Sur" tipo="duda" estado="en_proceso" antiguedad="hace 1 d" />
          </div>
        </section>
      </div>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-text">Clientes</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <ClientCard
            nombre="Comercial Andes SpA"
            rut="76.123.456-7"
            agentesActivos={3}
            agentesTotal={3}
            usoMes={1240}
            costoEstimadoClp={45000}
            estadoKey="valida"
            estadoCobro="al_dia"
          />
          <ClientCard
            nombre="Ferretería Sur Ltda."
            rut="77.987.654-3"
            agentesActivos={1}
            agentesTotal={2}
            usoMes={210}
            costoEstimadoClp={9000}
            estadoKey="sin_key"
            estadoCobro="vencido"
          />
        </div>
      </section>
    </AppShell>
  );
}
