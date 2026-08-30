import { redirect } from "next/navigation";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { crearClienteServidor } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { obtenerContextoPortal } from "@/lib/portal/contexto";

export default async function CobrosClientePage() {
  const usuario = await obtenerUsuarioActual(); if (!usuario || usuario.rol !== "cliente") redirect("/login");
  const supabase = await crearClienteServidor(); const [contexto, { data: cobros }] = await Promise.all([obtenerContextoPortal(), supabase.from("cobros").select("id,monto,moneda,estado,dte_estado,created_at").order("created_at", { ascending:false })]);
  return <AppShell rol="cliente" empresaNombre={contexto.empresaNombre} costoEstimadoClp={contexto.costoEstimadoClp} reclamosAbiertos={contexto.ticketsSinLeer}><h1 className="text-2xl font-bold text-text">Estado de cuenta</h1><p className="mt-1 text-text-muted">Tus cobros y documentos tributarios.</p><div className="mt-6 space-y-3">{(cobros ?? []).map((c) => <article key={c.id} className="rounded-xl border border-border bg-surface p-4"><p className="font-semibold text-text">${Number(c.monto).toLocaleString("es-CL")} {c.moneda}</p><p className="mt-1 text-sm text-text-muted">Pago: {c.estado} · Documento: {c.dte_estado === "emitido" ? "emitido" : "pendiente"}</p></article>)}</div></AppShell>;
}
