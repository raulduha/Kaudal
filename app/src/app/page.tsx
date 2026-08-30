import Link from "next/link";
import { redirect } from "next/navigation";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { crearClienteServidor } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { StatCard } from "@/components/ui/StatCard";
import { AgenteEstadoChip, EstadoAgente } from "@/components/ui/AgenteEstadoChip";
import { CerrarSesionBoton } from "./portal/CerrarSesionBoton";

const estadoLegible: Record<string, string> = { activo: "En línea", pausado: "Pausado", caido: "Con problema" };

export default async function DashboardPage() {
  const usuario = await obtenerUsuarioActual();
  if (!usuario) redirect("/login");
  if (usuario.rol === "cliente") redirect("/portal");
  const supabase = await crearClienteServidor();
  const [{ count: clientes }, { count: agentes }, { count: ticketsAbiertos }, { data: recientes }] = await Promise.all([
    supabase.from("clientes").select("id", { count: "exact", head: true }).is("deleted_at", null),
    supabase.from("agentes").select("id", { count: "exact", head: true }).is("deleted_at", null),
    supabase.from("tickets_reclamos").select("id", { count: "exact", head: true }).neq("estado", "cerrado"),
    supabase.from("agentes").select("id,nombre,estado,canal,created_at").is("deleted_at", null).order("created_at", { ascending: false }).limit(4),
  ]);

  return <AppShell rol="operador" activeId="dashboard" nombrePerfil={usuario.nombre ?? usuario.email}>
    <section className="relative overflow-hidden rounded-2xl border border-border bg-surface px-6 py-7 sm:px-8">
      <div aria-hidden="true" className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-primary/15 blur-3xl" />
      <div aria-hidden="true" className="absolute -bottom-32 right-20 h-56 w-56 rounded-full bg-secondary/10 blur-3xl" />
      <div className="relative max-w-2xl"><p className="text-sm font-medium text-secondary">Centro de operación</p><h1 className="mt-2 text-3xl font-bold tracking-tight text-text sm:text-4xl">Todo tu negocio de agentes, claro y bajo control.</h1><p className="mt-3 max-w-xl text-text-muted">Registra agentes, acompaña a tus clientes y mantén el cobro cubierto antes de desplegar.</p><div className="mt-6 flex flex-wrap gap-3"><Link href="/agentes/nuevo"><Button>Registrar agente</Button></Link><Link href="/clientes/nuevo"><Button variant="secondary">Inscribir cliente</Button></Link><CerrarSesionBoton /></div></div>
    </section>

    <section aria-label="Resumen del negocio" className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><StatCard label="Clientes activos" value={clientes ?? 0} hint="empresas acompañadas" /><StatCard label="Agentes registrados" value={agentes ?? 0} variant="secondary" hint="en tu operación" /><StatCard label="Tickets por resolver" value={ticketsAbiertos ?? 0} variant="accent-warm" hint="requieren atención" /><StatCard label="Estado de plataforma" value="En línea" variant="secondary" hint="entorno local conectado" /></section>

    <section className="mt-8 grid gap-6 xl:grid-cols-[1.45fr_0.85fr]">
      <div className="rounded-xl border border-border bg-surface"><div className="flex items-center justify-between border-b border-border px-5 py-4"><div><h2 className="font-semibold text-text">Actividad reciente</h2><p className="mt-0.5 text-sm text-text-muted">Los últimos agentes incorporados.</p></div><Link href="/agentes" className="text-sm font-medium text-primary-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Ver agentes</Link></div>{(recientes ?? []).length === 0 ? <div className="px-5 py-12 text-center"><p className="font-medium text-text">Aún no hay agentes registrados</p><p className="mt-1 text-sm text-text-muted">Empieza conectando uno que ya esté funcionando.</p><Link href="/agentes/nuevo" className="mt-4 inline-block"><Button>Registrar el primero</Button></Link></div> : <ul className="divide-y divide-border">{recientes?.map((agente) => <li key={agente.id} className="flex items-center justify-between gap-4 px-5 py-4"><div className="min-w-0"><p className="truncate font-medium text-text">{agente.nombre}</p><p className="mt-0.5 text-sm text-text-muted">{agente.canal ?? "Sin canal"} · {estadoLegible[agente.estado] ?? agente.estado}</p></div><AgenteEstadoChip estado={agente.estado as EstadoAgente} /></li>)}</ul>}</div>
      <aside className="rounded-xl border border-border bg-surface p-5"><p className="text-sm font-medium text-secondary">Siguiente paso recomendado</p><h2 className="mt-2 text-xl font-semibold text-text">Convierte un agente en un servicio.</h2><p className="mt-2 text-sm leading-6 text-text-muted">Crea el cliente, registra su agente y configura su cobertura antes de activar una instancia.</p><ol className="mt-5 space-y-3 text-sm"><li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary-text">1</span><span className="pt-0.5 text-text-muted">Inscribe la empresa cliente.</span></li><li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary-text">2</span><span className="pt-0.5 text-text-muted">Conecta el agente que ya corre.</span></li><li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary-text">3</span><span className="pt-0.5 text-text-muted">Revisa uso, soporte y cobertura.</span></li></ol><Link href="/clientes/nuevo" className="mt-6 block"><Button className="w-full">Comenzar con un cliente</Button></Link></aside>
    </section>
  </AppShell>;
}
