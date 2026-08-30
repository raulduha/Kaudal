import Link from "next/link";
import { redirect } from "next/navigation";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { crearClienteServidor } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { OnboardingApiKey } from "@/components/portal/OnboardingApiKey";
import { UsoPorDia } from "@/components/portal/UsoPorDia";
import { StatCard } from "@/components/ui/StatCard";
import { ClientAgentCard } from "@/components/ui/ClientAgentCard";
import { obtenerContextoPortal, inicioDeMesIso } from "@/lib/portal/contexto";
import { obtenerAgentesConUsoDelMes } from "@/lib/portal/agentes-cliente";
import { calcularEstadoCliente } from "@/lib/agentes/estado-cliente";

const formatoClp = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });

// Tarea 8.1 (docs/eng/06 §4): "Inicio — Dónde se usa", la pantalla estrella
// del portal, más el resumen de "Mi agente" (§5) sin salir de Inicio. Antes
// de esta tarea la pantalla era un placeholder fijo ("Tu portal se está
// construyendo...") — 3.2 solo dejó el onboarding funcionando.
//
// El gráfico usa el mismo período de mes calendario que "Uso y costo"
// (7.3), no los "últimos 30 días" literales del doc: son la misma cifra que
// el topbar y la tarjeta "Costo estimado" muestran arriba, y tener dos
// ventanas de tiempo distintas en pantallas contiguas confundiría más de lo
// que ayuda. Decisión de alcance, no un olvido.
export default async function PortalPage() {
  const usuario = await obtenerUsuarioActual();
  if (!usuario || usuario.rol !== "cliente") {
    redirect("/login");
  }

  const supabase = await crearClienteServidor();
  const { data: keyActiva } = await supabase
    .from("api_keys_publicas")
    .select("id")
    .eq("estado", "activa")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!keyActiva) {
    return (
      <AppShell rol="cliente" activeId="inicio">
        <OnboardingApiKey nombre={usuario.nombre} />
      </AppShell>
    );
  }

  const inicioMes = inicioDeMesIso();
  const [contexto, { data: usoDelMes }, agentesResumen, { count: ticketsAbiertos }, { data: instancia }] = await Promise.all([
    obtenerContextoPortal(),
    supabase.from("uso_diario").select("dia, usos").gte("dia", inicioMes),
    obtenerAgentesConUsoDelMes(supabase, inicioMes),
    supabase.from("tickets_reclamos").select("id", { count: "exact", head: true }).neq("estado", "cerrado"),
    // Vista segura: solo expone estado, jamás URL ni IDs de infraestructura.
    supabase.from("instancias_publicas").select("estado").maybeSingle(),
  ]);

  const totalUsos = (usoDelMes ?? []).reduce((acc, f) => acc + Number(f.usos), 0);
  const porDia = new Map<string, number>();
  for (const f of usoDelMes ?? []) {
    const dia = f.dia.slice(0, 10);
    porDia.set(dia, (porDia.get(dia) ?? 0) + Number(f.usos));
  }

  const agentesFuncionando = agentesResumen.filter(
    (a) => calcularEstadoCliente(a.estadoBackend, a.ultimaActividad) === "funcionando"
  ).length;

  return (
    <AppShell
      rol="cliente"
      activeId="inicio"
      empresaNombre={contexto.empresaNombre}
      costoEstimadoClp={contexto.costoEstimadoClp}
      reclamosAbiertos={contexto.ticketsSinLeer}
    >
      <h1 className="text-2xl font-bold text-text">
        Hola{usuario.nombre ? `, ${usuario.nombre}` : ""}
      </h1>
      <p className="mt-1 text-text-muted">Esto es lo que pasa con tu agente ahora mismo.</p>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Usos este mes" value={totalUsos.toLocaleString("es-CL")} variant="primary" />
        <StatCard
          label="Costo estimado"
          value={`≈ ${formatoClp.format(contexto.costoEstimadoClp)}`}
          variant="secondary"
          hint="Estimado, no facturado"
        />
        <StatCard
          label="Agentes activos"
          value={`${agentesFuncionando} de ${agentesResumen.length}`}
          variant="secondary"
          hint="funcionando"
        />
        <StatCard label="Tickets abiertos" value={ticketsAbiertos ?? 0} variant="accent-warm" hint="sin resolver" />
      </div>

      {instancia && <section className="mt-6 rounded-xl border border-border bg-surface p-4">
        <h2 className="font-semibold text-text">Estado de tu servicio</h2>
        <p className="mt-1 text-sm text-text-muted">{instancia.estado === "activa" ? "Funcionando" : instancia.estado === "suspendida" ? "Suspendido. Escríbenos si necesitas ayuda." : "En preparación."}</p>
      </section>}

      {totalUsos === 0 ? (
        <div className="mt-8 flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface p-12 text-center">
          <p className="font-semibold text-text">Aún no hay usos que mostrar</p>
          <p className="mt-1 max-w-sm text-sm text-text-muted">
            En cuanto tu agente empiece a trabajar, verás acá dónde y cuánto se usa, día a día. Suele tardar unos
            minutos desde la primera consulta.
          </p>
        </div>
      ) : (
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-text">Uso por día</h2>
          <UsoPorDia porDia={Object.fromEntries(porDia)} />
        </section>
      )}

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text">Mi agente</h2>
          {agentesResumen.length > 0 && (
            <Link
              href="/portal/agentes"
              className="-mx-2 inline-flex min-h-11 items-center rounded-md px-2 text-sm font-medium text-primary-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Ver todos →
            </Link>
          )}
        </div>

        {agentesResumen.length === 0 ? (
          <div className="mt-3 flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface p-12 text-center">
            <p className="font-semibold text-text">Todavía no tienes agentes conectados</p>
            <p className="mt-1 max-w-sm text-sm text-text-muted">
              Tu operador los está preparando. Apenas quede uno listo, aparecerá acá con su estado y su uso.
            </p>
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {agentesResumen.slice(0, 3).map((a) => (
              <Link key={a.id} href={`/portal/agentes/${a.id}`} className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                <ClientAgentCard
                  nombre={a.nombre}
                  modelo={a.modelo}
                  estado={calcularEstadoCliente(a.estadoBackend, a.ultimaActividad)}
                  usosMes={a.usosMes}
                  costoMes={a.costoMes}
                  ultimaActividad={a.ultimaActividad}
                />
              </Link>
            ))}
          </div>
        )}
      </section>

      <div className="mt-8 flex flex-col items-start gap-1 rounded-lg border border-border bg-surface px-5 py-4 text-sm text-text-muted sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <p>¿Algo no cuadra con estos números?</p>
        <Link
          href="/portal/reclamos"
          className="-mx-2 inline-flex min-h-11 items-center rounded-md px-2 font-medium text-primary-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Cuéntanos →
        </Link>
      </div>
    </AppShell>
  );
}
