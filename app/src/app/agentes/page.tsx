import Link from "next/link";
import { redirect } from "next/navigation";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { crearClienteServidor } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { AgenteEstadoChip, EstadoAgente } from "@/components/ui/AgenteEstadoChip";

const TIPO_LABEL: Record<string, string> = { mastra: "Mastra", n8n: "n8n", custom: "Propio" };
const CANAL_LABEL: Record<string, string> = { whatsapp: "WhatsApp", web: "Web", api: "API", otro: "Otro" };

export default async function AgentesPage() {
  const usuario = await obtenerUsuarioActual();
  if (!usuario || usuario.rol !== "operador") {
    redirect("/login");
  }

  const supabase = await crearClienteServidor();
  // select(*) sobre `agentes` está denegado por diseño para `authenticated`
  // (columnas de auth cifradas nunca se exponen ni por accidente) — hay que
  // leer por la vista `agentes_publicos`.
  const { data: agentes } = await supabase
    .from("agentes")
    .select("id, nombre, tipo, canal, endpoint_url, estado, cliente_id")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const clienteIds = [...new Set((agentes ?? []).map((a) => a.cliente_id as string))];
  const { data: clientes } = clienteIds.length
    ? await supabase.from("clientes").select("id, razon_social").in("id", clienteIds)
    : { data: [] as { id: string; razon_social: string }[] };
  const nombreCliente = new Map((clientes ?? []).map((c) => [c.id, c.razon_social]));

  const lista = agentes ?? [];

  return (
    <AppShell rol="operador" activeId="agentes" nombrePerfil={usuario.nombre ?? usuario.email}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text">Agentes</h1>
          <p className="mt-1 text-text-muted">Los agentes que ya corren, apuntados por endpoint.</p>
        </div>
        <Link href="/agentes/nuevo">
          <Button>Registrar agente</Button>
        </Link>
      </div>

      {lista.length === 0 ? (
        <div className="mt-10 flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface p-12 text-center">
          <p className="text-text-muted">Este cliente aún no tiene agentes. Registra el que ya tiene corriendo.</p>
          <Link href="/agentes/nuevo" className="mt-4">
            <Button>Registrar agente</Button>
          </Link>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-alt/40 text-text-muted">
                <th className="px-4 py-3 font-medium">Agente</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Endpoint</th>
                <th className="px-4 py-3 font-medium">Canal</th>
                <th className="px-4 py-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((a) => {
                let host = a.endpoint_url ?? "";
                try {
                  host = a.endpoint_url ? new URL(a.endpoint_url).host : "—";
                } catch {
                  /* deja el valor crudo si no parsea */
                }
                return (
                  <tr key={a.id} className="border-b border-border transition-colors last:border-0 hover:bg-surface-alt/60">
                    <td className="px-4 py-3">
                      <div className="font-medium text-text">{a.nombre}</div>
                      <div className="text-xs text-text-muted">{TIPO_LABEL[a.tipo] ?? a.tipo}</div>
                    </td>
                    <td className="px-4 py-3 text-text-muted">{nombreCliente.get(a.cliente_id) ?? "—"}</td>
                    <td className="px-4 py-3 text-text-muted">{host}</td>
                    <td className="px-4 py-3 text-text-muted">{a.canal ? CANAL_LABEL[a.canal] ?? a.canal : "—"}</td>
                    <td className="px-4 py-3">
                      <AgenteEstadoChip estado={a.estado as EstadoAgente} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
