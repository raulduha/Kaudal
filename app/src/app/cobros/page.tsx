import { redirect } from "next/navigation";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { crearClienteServidor } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { StatusChip } from "@/components/ui/StatusChip";
import { InfoAyuda } from "@/components/ui/InfoAyuda";

export default async function CobrosPage() {
  const usuario = await obtenerUsuarioActual();
  if (!usuario || usuario.rol !== "operador") redirect("/login");
  const supabase = await crearClienteServidor();
  const [{ data: cobros }, { data: clientes }] = await Promise.all([
    supabase.from("cobros").select("id, cliente_id, monto, moneda, estado, dte_estado, created_at").order("created_at", { ascending: false }),
    supabase.from("clientes").select("id, razon_social"),
  ]);
  const nombres = new Map((clientes ?? []).map((c) => [c.id, c.razon_social]));
  return <AppShell rol="operador" activeId="cobros" nombrePerfil={usuario.nombre ?? usuario.email}>
    <h1 className="text-2xl font-bold text-text">Cobros <InfoAyuda titulo="Cómo funcionan los cobros">El cobro es por tu servicio mensual, no por los tokens que consume el cliente. Hoy esta pantalla es sandbox: no cobra dinero ni emite DTE hasta configurar Flow y el proveedor tributario real.</InfoAyuda></h1><p className="mt-1 text-text-muted">Pagos y documentos tributarios de tus clientes.</p>
    <p className="mt-5 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-text">Modo sandbox: Flow y DTE se conectarán al configurar las credenciales de producción.</p>
    <div className="mt-6 overflow-x-auto rounded-xl border border-border bg-surface"><table className="w-full text-left text-sm"><thead><tr className="border-b border-border text-text-muted"><th className="p-4">Cliente</th><th className="p-4">Monto neto</th><th className="p-4">Pago</th><th className="p-4">Documento</th></tr></thead><tbody>{(cobros ?? []).map((c) => <tr key={c.id} className="border-b border-border last:border-0"><td className="p-4">{nombres.get(c.cliente_id) ?? "Cliente"}</td><td className="p-4">${Number(c.monto).toLocaleString("es-CL")} {c.moneda}</td><td className="p-4"><StatusChip tone={c.estado === "pagado" ? "secondary" : "warning"} label={c.estado} /></td><td className="p-4"><StatusChip tone={c.dte_estado === "emitido" ? "secondary" : "muted"} label={c.dte_estado === "emitido" ? "Emitido" : "Pendiente"} /></td></tr>)}</tbody></table></div>
  </AppShell>;
}
