import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { crearClienteServidor } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { StatCard } from "@/components/ui/StatCard";
import { AgenteClienteEstadoChip } from "@/components/ui/AgenteClienteEstadoChip";
import { UsoPorDia } from "@/components/portal/UsoPorDia";
import { obtenerContextoPortal, inicioDeMesIso } from "@/lib/portal/contexto";
import { obtenerAgentesConUsoDelMes } from "@/lib/portal/agentes-cliente";
import { calcularEstadoCliente } from "@/lib/agentes/estado-cliente";
import { formatoTiempoRelativo } from "@/lib/formato/tiempo-relativo";

const formatoClp = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });

const CANAL_LABEL: Record<string, string> = {
  whatsapp: "por WhatsApp",
  web: "en tu sitio web",
  api: "por API",
  otro: "",
};

// "Dónde vive" (docs/eng/06 §5): una descripción amable, sin URLs internas ni
// datos técnicos — deriva del `estado` real, no de un concepto de
// "publicado/en pruebas" que el esquema no modela todavía.
function dondeVive(estadoBackend: "activo" | "pausado" | "caido" | "archivado", canal: string | null): string {
  const canalTexto = canal ? CANAL_LABEL[canal] ?? "" : "";
  if (estadoBackend === "activo") return `Publicado y en línea${canalTexto ? " " + canalTexto : ""}.`;
  if (estadoBackend === "pausado") return "En pausa por tu operador.";
  if (estadoBackend === "caido") return "Con problemas de conexión ahora mismo.";
  return "—";
}

// Tarea 8.1 (docs/eng/06 §5 "Detalle de un agente"): uso de este agente,
// costo del mes, y "dónde vive". El botón "¿Tienes una duda sobre este
// agente?" del doc NO se construyó todavía — abrir un ticket precargado es
// tarea 9.1 (Dudas y reclamos no existe como pantalla aún); se deja fuera en
// vez de enlazar a un formulario que no existe.
export default async function DetalleAgentePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const usuario = await obtenerUsuarioActual();
  if (!usuario || usuario.rol !== "cliente") {
    redirect("/login");
  }

  const supabase = await crearClienteServidor();
  const inicioMes = inicioDeMesIso();
  const [contexto, agentes, { data: usoDelMes }] = await Promise.all([
    obtenerContextoPortal(),
    obtenerAgentesConUsoDelMes(supabase, inicioMes),
    supabase.from("uso_diario").select("dia, usos").eq("agente_id", id).gte("dia", inicioMes),
  ]);

  const agente = agentes.find((a) => a.id === id);
  // RLS ya impide ver agentes de otro cliente (agentes_cliente); si no
  // aparece en la lista propia es que no existe o no es suyo — 404 en ambos
  // casos, sin distinguir, para no filtrar existencia de IDs ajenos.
  if (!agente) {
    notFound();
  }

  const porDia = new Map<string, number>();
  for (const f of usoDelMes ?? []) {
    const dia = f.dia.slice(0, 10);
    porDia.set(dia, (porDia.get(dia) ?? 0) + Number(f.usos));
  }

  const estadoCliente = calcularEstadoCliente(agente.estadoBackend, agente.ultimaActividad);

  return (
    <AppShell
      rol="cliente"
      activeId="mis-agentes"
      empresaNombre={contexto.empresaNombre}
      costoEstimadoClp={contexto.costoEstimadoClp}
      reclamosAbiertos={contexto.ticketsSinLeer}
    >
      <Link
        href="/portal/agentes"
        className="-ml-2 inline-flex min-h-11 items-center rounded-md px-2 text-sm font-medium text-text-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        ← Mis agentes
      </Link>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text">{agente.nombre}</h1>
          {agente.modelo && <p className="mt-1 text-text-muted">{agente.modelo}</p>}
        </div>
        <AgenteClienteEstadoChip estado={estadoCliente} />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Uso este mes" value={agente.usosMes.toLocaleString("es-CL")} variant="primary" />
        <StatCard
          label="Costo estimado"
          value={`≈ ${formatoClp.format(agente.costoMes)}`}
          variant="secondary"
          hint="Estimado, no facturado"
        />
        <StatCard
          label="Última actividad"
          value={agente.ultimaActividad ? formatoTiempoRelativo(agente.ultimaActividad) : "Sin actividad"}
          variant="secondary"
        />
      </div>

      <div className="mt-6 rounded-lg border border-border bg-surface px-5 py-4">
        <h2 className="text-sm font-semibold text-text-muted">Dónde vive</h2>
        <p className="mt-1 text-text">{dondeVive(agente.estadoBackend, agente.canal)}</p>
      </div>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-text">Uso por día</h2>
        <UsoPorDia porDia={Object.fromEntries(porDia)} />
      </section>
    </AppShell>
  );
}
