import Link from "next/link";
import { redirect } from "next/navigation";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { crearClienteServidor } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { KeyStatusChip, EstadoKey } from "@/components/ui/KeyStatusChip";
import { ClientStatusChip, EstadoCliente } from "@/components/ui/ClientStatusChip";

const formatoFecha = new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "short", year: "numeric" });

// docs/18 §9: "El operador ve solo la key enmascarada (ej: sk-...ab12)".
const NOMBRE_PROVEEDOR: Record<string, string> = { anthropic: "Anthropic", openai: "OpenAI", otro: "Otro" };

export default async function ClientesPage() {
  const usuario = await obtenerUsuarioActual();
  if (!usuario || usuario.rol !== "operador") {
    redirect("/login");
  }

  const supabase = await crearClienteServidor();
  const { data: clientes } = await supabase
    .from("clientes")
    .select("id, razon_social, rut, estado, created_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const { data: keysActivas } = await supabase
    .from("api_keys_publicas")
    .select("cliente_id, proveedor, key_last4")
    .eq("estado", "activa");
  const keyPorCliente = new Map(
    (keysActivas ?? []).map((k) => [k.cliente_id as string, { proveedor: k.proveedor as string, last4: k.key_last4 as string | null }])
  );

  const lista = clientes ?? [];

  return (
    <AppShell rol="operador" activeId="clientes" nombrePerfil={usuario.nombre ?? usuario.email}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text">Clientes</h1>
          <p className="mt-1 text-text-muted">Las empresas que inscribiste en Kaudal.</p>
        </div>
        <Link href="/clientes/nuevo">
          <Button>Inscribir cliente</Button>
        </Link>
      </div>

      {lista.length === 0 ? (
        <div className="mt-10 flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface p-12 text-center">
          <p className="text-text-muted">Todavía no inscribes clientes. Parte por acá.</p>
          <Link href="/clientes/nuevo" className="mt-4">
            <Button>Inscribir cliente</Button>
          </Link>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-alt/40 text-text-muted">
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Key del cliente</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Inscrito</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((c) => {
                const key = keyPorCliente.get(c.id);
                const estadoKey: EstadoKey = key ? "valida" : "sin_key";
                return (
                  <tr key={c.id} className="border-b border-border transition-colors last:border-0 hover:bg-surface-alt/60">
                    <td className="px-4 py-3">
                      <div className="font-medium text-text">{c.razon_social}</div>
                      <div className="text-xs text-text-muted">{c.rut ?? "Sin RUT"}</div>
                    </td>
                    <td className="px-4 py-3">
                      <KeyStatusChip estado={estadoKey} />
                      {key && (
                        <div className="mt-1 text-xs text-text-muted">
                          {NOMBRE_PROVEEDOR[key.proveedor] ?? key.proveedor} ••••{key.last4 ?? "----"}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <ClientStatusChip estado={c.estado as EstadoCliente} />
                    </td>
                    <td className="px-4 py-3 text-text-muted">
                      {formatoFecha.format(new Date(c.created_at))}
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
