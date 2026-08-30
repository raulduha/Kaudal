"use client";

import Link from "next/link";
import { colors } from "@brand/brand.config";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { Badge, RoleBadge } from "@/components/ui/Badge";
import { AgentStatusChip, StatusChip } from "@/components/ui/StatusChip";
import { StatCard } from "@/components/ui/StatCard";
import { AgentCard } from "@/components/ui/AgentCard";
import { ClientCard } from "@/components/ui/ClientCard";
import { TicketCard } from "@/components/ui/TicketCard";
import { useToast } from "@/components/ui/Toast";

const swatches: { nombre: string; clase: string; hex: string }[] = [
  { nombre: "bg", clase: "bg-bg", hex: colors.bg },
  { nombre: "surface", clase: "bg-surface", hex: colors.surface },
  { nombre: "surface-alt", clase: "bg-surface-alt", hex: colors.surfaceAlt },
  { nombre: "primary", clase: "bg-primary", hex: colors.primary },
  { nombre: "secondary", clase: "bg-secondary", hex: colors.secondary },
  { nombre: "accent-warm", clase: "bg-accent-warm", hex: colors.accentWarm },
  { nombre: "success", clase: "bg-success", hex: colors.success },
  { nombre: "warning", clase: "bg-warning", hex: colors.warning },
  { nombre: "danger", clase: "bg-danger", hex: colors.danger },
  { nombre: "info", clase: "bg-info", hex: colors.info },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold text-text">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/**
 * Página de muestra del design system (Fase 1 de TASKS.md: 1.1 tokens + 1.2 componentes base).
 * No es una pantalla de producto — sirve para comprobar visualmente que
 * brand/brand.config.ts llega hasta los componentes de src/components/ui.
 */
export default function DesignSystemPage() {
  const { toast } = useToast();

  return (
    <main className="min-h-screen bg-bg p-10 font-sans text-text">
      <h1 className="text-2xl font-bold">Design system de Kaudal</h1>
      <p className="mt-2 text-text-muted">
        Tokens y componentes base generados desde <code className="font-mono text-sm">brand/brand.config.ts</code>.
      </p>

      <Section title="Tokens de color">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          {swatches.map((s) => (
            <div key={s.nombre} className="rounded-lg border border-border bg-surface p-4">
              <div className={`h-16 w-full rounded-md ${s.clase}`} />
              <div className="mt-3 text-sm font-medium">{s.nombre}</div>
              <div className="font-mono text-xs text-text-faint">{s.hex}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Radios">
        <div className="flex flex-wrap gap-4 rounded-xl border border-border bg-surface-alt p-6">
          <div className="h-12 w-12 rounded-sm bg-primary" />
          <div className="h-12 w-12 rounded-md bg-primary" />
          <div className="h-12 w-12 rounded-lg bg-primary" />
          <div className="h-12 w-12 rounded-xl bg-primary" />
          <div className="h-12 w-12 rounded-pill bg-primary" />
        </div>
      </Section>

      <Section title="Botones">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary">Inscribir cliente</Button>
          <Button variant="secondary">Ver detalle</Button>
          <Button variant="ghost">Cancelar</Button>
          <Button variant="danger">Suspender</Button>
          <Button variant="primary" size="sm">
            Acción chica
          </Button>
          <Button variant="primary" disabled>
            Deshabilitado
          </Button>
        </div>
      </Section>

      <Section title="Inputs">
        <div className="grid max-w-xl gap-4">
          <Input label="Razón social" placeholder="Comercial Andes SpA" required />
          <Input label="RUT" placeholder="12.345.678-9" helperText="Formato 12.345.678-9. Lo validamos al tiro." />
          <Input label="Email de contacto" type="email" error="Ingresa un correo válido." />
          <Select
            label="Plan"
            placeholder="Elige un plan"
            options={[
              { value: "basico", label: "Básico" },
              { value: "pro", label: "Pro" },
            ]}
          />
          <Textarea label="Descripción del agente" placeholder="Qué hace, en simple." />
        </div>
      </Section>

      <Section title="Badges y chips de estado">
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone="primary">Mastra</Badge>
          <Badge tone="secondary">n8n</Badge>
          <Badge tone="muted">Código propio</Badge>
          <Badge tone="accent-warm">Reclamo</Badge>
          <RoleBadge rol="operador" />
          <RoleBadge rol="cliente" />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <AgentStatusChip status="idle" />
          <AgentStatusChip status="working" />
          <AgentStatusChip status="done" />
          <AgentStatusChip status="waiting" />
          <AgentStatusChip status="updated" />
          <AgentStatusChip status="error" />
          <StatusChip tone="accent-warm" label="Sin key" />
        </div>
      </Section>

      <Section title="Toasts">
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => toast({ variant: "info", title: "Conectado", description: "Tu agente responde bien." })}>
            Info
          </Button>
          <Button
            variant="secondary"
            onClick={() => toast({ variant: "success", title: "Listo", description: "Inscribiste a Comercial Andes." })}
          >
            Éxito
          </Button>
          <Button
            variant="secondary"
            onClick={() => toast({ variant: "warning", title: "Pago atrasado", description: "Este cliente tiene el cobro vencido." })}
          >
            Alerta
          </Button>
          <Button
            variant="secondary"
            onClick={() => toast({ variant: "danger", title: "No pudimos conectar", description: "Revisa la URL o la autenticación." })}
          >
            Error
          </Button>
        </div>
      </Section>

      <Section title="KPI cards">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Clientes activos" value={12} variant="primary" />
          <StatCard label="Agentes corriendo" value="18/20" variant="secondary" />
          <StatCard label="Reclamos abiertos" value={3} variant="accent-warm" hint="Enlaza a la bandeja" />
          <StatCard label="Uso del mes" value="—" loading />
        </div>
      </Section>

      <Section title="Tarjeta de agente">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <AgentCard
            nombre="Agente de Cobranza"
            tipo="mastra"
            status="working"
            cliente="Comercial Andes"
            usoMes={342}
            actividad={[2, 4, 3, 6, 5, 8, 7, 9]}
          />
          <AgentCard nombre="Cotizador" tipo="n8n" status="idle" cliente="ACME Ltda." usoMes={58} />
          <AgentCard nombre="Soporte WhatsApp" tipo="propio" status="error" cliente="Ferretería Sur" usoMes={12} />
        </div>
      </Section>

      <Section title="Tarjeta de cliente">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
      </Section>

      <Section title="Layouts por rol">
        <p className="mb-4 text-sm text-text-muted">
          Acento naranjo para el operador, menta para el cliente — badge de rol siempre visible en el topbar.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/design/operador">
            <Button variant="secondary">Ver layout Operador</Button>
          </Link>
          <Link href="/design/cliente">
            <Button variant="secondary">Ver layout Cliente</Button>
          </Link>
        </div>
      </Section>

      <Section title="Tarjeta de ticket">
        <div className="grid gap-3">
          <TicketCard
            asunto="No me llegó la boleta de agosto"
            cliente="Comercial Andes"
            tipo="reclamo"
            estado="abierto"
            antiguedad="hace 4 h"
            sinLeer
          />
          <TicketCard
            asunto="¿Cómo cambio el tono del agente?"
            cliente="Ferretería Sur"
            tipo="duda"
            estado="en_proceso"
            antiguedad="hace 1 d"
          />
          <TicketCard
            asunto="Se cayó el agente de cotizaciones"
            cliente="ACME Ltda."
            tipo="reclamo"
            estado="respondido"
            antiguedad="hace 3 d"
          />
        </div>
      </Section>
    </main>
  );
}
