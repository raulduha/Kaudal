import { redirect } from "next/navigation";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { crearClienteServidor } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { StatCard } from "@/components/ui/StatCard";
import { LimiteMensual } from "./LimiteMensual";
import { UsoPorDia } from "@/components/portal/UsoPorDia";
import { obtenerContextoPortal, inicioDeMesIso } from "@/lib/portal/contexto";

const formatoClp = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });

// Tarea 7.3 (docs/eng/06, docs/18 §10): "Dónde se usa" — uso por día/agente,
// costo estimado, modelo, y aviso al acercarse al límite que el CLIENTE
// declaró (no un tope que Kaudal imponga — ver docs/18 §10: "los límites que
// ÉL configuró en su API key"). Tiempo real vía WebSocket queda fuera de
// alcance por ahora (no hay infraestructura de tiempo real en el proyecto
// todavía) — esta pantalla se refresca al navegar/recargar; documentado como
// deuda explícita en TASKS.md.
export default async function UsoPage() {
  const usuario = await obtenerUsuarioActual();
  if (!usuario || usuario.rol !== "cliente") {
    redirect("/login");
  }

  const supabase = await crearClienteServidor();

  const [{ data: cliente }, { data: usoDelMes }, { data: agentes }, contexto] = await Promise.all([
    supabase.from("clientes").select("limite_mensual_clp").maybeSingle(),
    supabase
      .from("uso_diario")
      .select("agente_id, dia, usos, costo_estimado, moneda")
      .gte("dia", inicioDeMesIso())
      .order("dia"),
    supabase.from("agentes").select("id, nombre, modelo_default").is("deleted_at", null),
    obtenerContextoPortal(),
  ]);

  const filas = usoDelMes ?? [];
  const nombrePorAgente = new Map((agentes ?? []).map((a) => [a.id, { nombre: a.nombre, modelo: a.modelo_default }]));

  const totalUsos = filas.reduce((acc, f) => acc + Number(f.usos), 0);
  const totalCosto = filas.reduce((acc, f) => acc + Number(f.costo_estimado), 0);

  const porAgente = new Map<string, { nombre: string; modelo: string | null; usos: number; costo: number }>();
  for (const f of filas) {
    const info = nombrePorAgente.get(f.agente_id);
    const actual = porAgente.get(f.agente_id) ?? { nombre: info?.nombre ?? "Agente eliminado", modelo: info?.modelo ?? null, usos: 0, costo: 0 };
    actual.usos += Number(f.usos);
    actual.costo += Number(f.costo_estimado);
    porAgente.set(f.agente_id, actual);
  }

  const porDia = new Map<string, number>();
  for (const f of filas) {
    const dia = f.dia.slice(0, 10);
    porDia.set(dia, (porDia.get(dia) ?? 0) + Number(f.usos));
  }

  // 0 es un límite válido y DISTINTO de "sin configurar" (null): un cliente
  // que declaró límite 0 quiere que le avisemos de inmediato apenas gaste algo.
  const limite = cliente?.limite_mensual_clp != null ? Number(cliente.limite_mensual_clp) : null;
  const porcentajeLimite =
    limite !== null ? (limite === 0 ? (totalCosto > 0 ? 999 : 0) : Math.min(Math.round((totalCosto / limite) * 100), 999)) : null;

  return (
    <AppShell
      rol="cliente"
      activeId="uso-costo"
      empresaNombre={contexto.empresaNombre}
      costoEstimadoClp={contexto.costoEstimadoClp}
      reclamosAbiertos={contexto.ticketsSinLeer}
    >
      <h1 className="text-2xl font-bold text-text">Dónde se usa</h1>
      <p className="mt-1 text-text-muted">Esto es lo que pasó este mes con tus agentes.</p>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Usos este mes" value={totalUsos.toLocaleString("es-CL")} variant="primary" />
        <StatCard label="Costo estimado" value={`≈ ${formatoClp.format(totalCosto)}`} variant="secondary" hint="Estimado, no facturado" />
        <StatCard label="Agentes con uso" value={porAgente.size} variant="secondary" />
      </div>

      {porcentajeLimite !== null && porcentajeLimite >= 80 && (
        <div
          role={porcentajeLimite >= 100 ? "alert" : "status"}
          aria-live={porcentajeLimite >= 100 ? "assertive" : "polite"}
          aria-atomic="true"
          className={`mt-4 flex items-start gap-3 rounded-md border p-4 text-sm ${
            porcentajeLimite >= 100
              ? "border-danger/30 bg-danger/10 text-danger"
              : "border-warning/30 bg-warning/10 text-warning"
          }`}
        >
          <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0">
            <path d="M10 3.5 2.5 16.5h15L10 3.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            <path d="M10 8.25v3.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="10" cy="14.25" r="0.9" fill="currentColor" />
          </svg>
          <p>
            {porcentajeLimite >= 100
              ? `Ya pasaste tu límite mensual (vas en el ${porcentajeLimite}%).`
              : `Vas en el ${porcentajeLimite}% de tu límite mensual.`}
          </p>
        </div>
      )}

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-text">Uso por día</h2>
        <UsoPorDia porDia={Object.fromEntries(porDia)} />
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-text">Uso por agente</h2>
        {porAgente.size === 0 ? (
          <p className="mt-3 text-text-muted">Todavía no hay uso registrado este mes.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-alt/40 text-text-muted">
                  <th scope="col" className="px-4 py-3 font-medium">Agente</th>
                  <th scope="col" className="px-4 py-3 font-medium">Modelo</th>
                  <th scope="col" className="px-4 py-3 font-medium">Usos</th>
                  <th scope="col" className="px-4 py-3 font-medium">Costo estimado</th>
                </tr>
              </thead>
              <tbody>
                {[...porAgente.entries()].map(([id, a]) => (
                  <tr key={id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 text-text">{a.nombre}</td>
                    <td className="px-4 py-3 text-text-muted">{a.modelo ?? "—"}</td>
                    <td className="px-4 py-3 text-text-muted">{a.usos.toLocaleString("es-CL")}</td>
                    <td className="px-4 py-3 text-text-muted">{`≈ ${formatoClp.format(a.costo)}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-8 max-w-md">
        <h2 className="text-lg font-semibold text-text">Tu límite mensual</h2>
        <p className="mt-1 text-sm text-text-muted">
          Lo que configuraste como tope de gasto en tu proveedor (Anthropic/OpenAI). Te avisamos cuando tu uso
          estimado se acerque.
        </p>
        <LimiteMensual limiteActual={limite} />
      </section>
    </AppShell>
  );
}
