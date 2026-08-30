import { redirect } from "next/navigation";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { crearClienteServidor } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { StatCard } from "@/components/ui/StatCard";
import { UsoPorDia } from "@/components/portal/UsoPorDia";

const formatoClp = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });

export default async function UsoOperadorPage() {
  const usuario = await obtenerUsuarioActual();
  if (!usuario || usuario.rol !== "operador") redirect("/login");
  const supabase = await crearClienteServidor();
  const ahora = new Date();
  const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1).toISOString();
  const [{ data: uso }, { data: agentes }, { data: clientes }] = await Promise.all([
    supabase.from("uso_diario").select("agente_id,dia,usos,costo_estimado").gte("dia", inicioMes).order("dia"),
    supabase.from("agentes").select("id,nombre,cliente_id").is("deleted_at", null),
    supabase.from("clientes").select("id,razon_social").is("deleted_at", null),
  ]);
  const filas = uso ?? [];
  const infoAgente = new Map((agentes ?? []).map((a) => [a.id, a]));
  const nombreCliente = new Map((clientes ?? []).map((c) => [c.id, c.razon_social]));
  const porDia = new Map<string, number>();
  const porAgente = new Map<string, { nombre: string; cliente: string; usos: number; costo: number }>();
  for (const fila of filas) {
    const dia = fila.dia.slice(0, 10);
    porDia.set(dia, (porDia.get(dia) ?? 0) + Number(fila.usos));
    const agente = infoAgente.get(fila.agente_id);
    const actual = porAgente.get(fila.agente_id) ?? { nombre: agente?.nombre ?? "Agente eliminado", cliente: agente ? nombreCliente.get(agente.cliente_id) ?? "Cliente" : "—", usos: 0, costo: 0 };
    actual.usos += Number(fila.usos); actual.costo += Number(fila.costo_estimado); porAgente.set(fila.agente_id, actual);
  }
  const totalUsos = filas.reduce((total, fila) => total + Number(fila.usos), 0);
  const totalCosto = filas.reduce((total, fila) => total + Number(fila.costo_estimado), 0);
  const ranking = [...porAgente.entries()].sort(([, a], [, b]) => b.costo - a.costo);

  return <AppShell rol="operador" activeId="uso" nombrePerfil={usuario.nombre ?? usuario.email}>
    <h1 className="text-2xl font-bold text-text">Uso y costo</h1>
    <p className="mt-1 text-text-muted">Una vista clara del uso estimado de todos tus agentes este mes.</p>
    <div className="mt-6 grid gap-4 sm:grid-cols-3"><StatCard label="Usos este mes" value={totalUsos.toLocaleString("es-CL")} /><StatCard label="Costo estimado" value={`≈ ${formatoClp.format(totalCosto)}`} variant="secondary" hint="informativo, no facturado" /><StatCard label="Agentes con uso" value={porAgente.size} variant="accent-warm" /></div>
    <section className="mt-8"><h2 className="text-lg font-semibold text-text">Uso por día</h2><UsoPorDia porDia={Object.fromEntries(porDia)} /></section>
    <section className="mt-8"><div className="flex items-end justify-between gap-4"><div><h2 className="text-lg font-semibold text-text">Agentes con mayor uso</h2><p className="mt-1 text-sm text-text-muted">Ordenados por costo estimado mensual.</p></div></div>{ranking.length === 0 ? <div className="mt-3 rounded-xl border border-dashed border-border bg-surface p-10 text-center"><p className="font-medium text-text">Aún no hay uso registrado</p><p className="mt-1 text-sm text-text-muted">Cuando tus agentes reporten actividad, aparecerá el resumen aquí.</p></div> : <div className="mt-3 overflow-x-auto rounded-xl border border-border bg-surface"><table className="w-full text-left text-sm"><thead><tr className="border-b border-border bg-surface-alt/40 text-text-muted"><th scope="col" className="px-4 py-3 font-medium">Agente</th><th scope="col" className="px-4 py-3 font-medium">Cliente</th><th scope="col" className="px-4 py-3 font-medium">Usos</th><th scope="col" className="px-4 py-3 font-medium">Costo estimado</th></tr></thead><tbody>{ranking.map(([id, agente]) => <tr key={id} className="border-b border-border last:border-0 hover:bg-surface-alt/60"><td className="px-4 py-3 font-medium text-text">{agente.nombre}</td><td className="px-4 py-3 text-text-muted">{agente.cliente}</td><td className="px-4 py-3 text-text-muted">{agente.usos.toLocaleString("es-CL")}</td><td className="px-4 py-3 text-text-muted">≈ {formatoClp.format(agente.costo)}</td></tr>)}</tbody></table></div>}</section>
  </AppShell>;
}
