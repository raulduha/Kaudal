import { redirect } from "next/navigation";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { crearClienteServidor } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { StatusChip } from "@/components/ui/StatusChip";
import { calcularRentabilidadInstancia } from "@/lib/instancias/suspension";
import { RegistrarInstanciaForm } from "@/components/instancias/RegistrarInstanciaForm";
import { InfoAyuda } from "@/components/ui/InfoAyuda";

export default async function InstanciasPage() {
  const usuario = await obtenerUsuarioActual();
  if (!usuario || usuario.rol !== "operador") redirect("/login");
  const supabase = await crearClienteServidor();
  const [{ data: instancias }, { data: clientes }, { data: suscripciones }] = await Promise.all([
    supabase.from("instancias_operador").select("id,cliente_id,estado,proveedor,costo_mensual_estimado_clp,suscripcion_id"),
    supabase.from("clientes").select("id,razon_social"),
    supabase.from("suscripciones").select("id,cliente_id,monto,estado,cubre_instancia,margen_pct"),
  ]);
  const nombres = new Map((clientes ?? []).map((c) => [c.id, c.razon_social]));
  const planes = new Map((suscripciones ?? []).map((s) => [s.id, s]));

  return <AppShell rol="operador" activeId="instancias" nombrePerfil={usuario.nombre ?? usuario.email}>
    <h1 className="text-2xl font-bold text-text">Instancias <InfoAyuda titulo="Cuándo usar una instancia">Una instancia es el servidor donde vive un agente. En sandbox la registras manualmente; Kaudal no permite activarla si la suscripción no cubre el costo. Railway automático requiere sus credenciales de producción.</InfoAyuda></h1>
    <p className="mt-1 text-text-muted">Servicios desplegados por cliente y su cobertura mensual.</p>
    <RegistrarInstanciaForm clientes={clientes ?? []} suscripciones={suscripciones ?? []} />
    <div className="mt-6 space-y-3">{(instancias ?? []).map((i) => {
      const suscripcion = i.suscripcion_id ? planes.get(i.suscripcion_id) : null;
      const rentabilidad = suscripcion ? calcularRentabilidadInstancia(Number(suscripcion.monto), Number(i.costo_mensual_estimado_clp), Number(suscripcion.margen_pct)) : null;
      const cobertura = !suscripcion?.cubre_instancia || !rentabilidad
        ? "Sin cobertura activa: no puede quedar activa."
        : rentabilidad.cubre
          ? `Cobertura activa · margen real $${rentabilidad.margenReal.toLocaleString("es-CL")} (mínimo $${rentabilidad.minimo.toLocaleString("es-CL")})`
          : `Cobertura aprobada, pero el cobro no alcanza el mínimo de $${rentabilidad.minimo.toLocaleString("es-CL")}.`;
      return <article key={i.id} className="rounded-xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="font-semibold text-text">{nombres.get(i.cliente_id) ?? "Cliente"}</p><p className="text-sm text-text-muted">{i.proveedor} · costo ${Number(i.costo_mensual_estimado_clp).toLocaleString("es-CL")}/mes</p></div>
          <StatusChip tone={i.estado === "activa" ? "secondary" : i.estado === "suspendida" ? "warning" : "muted"} label={i.estado} />
        </div>
        <p className="mt-3 text-sm text-text-muted">{cobertura}</p>
      </article>;
    })}</div>
  </AppShell>;
}
