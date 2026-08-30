import { redirect } from "next/navigation";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { crearClienteServidor } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { KeyStatusChip, EstadoKey } from "@/components/ui/KeyStatusChip";
import { obtenerContextoPortal } from "@/lib/portal/contexto";
import { ReemplazarApiKey } from "./ReemplazarApiKey";
import { DesconectarApiKey } from "./DesconectarApiKey";
import { CerrarSesionBoton } from "../CerrarSesionBoton";

// Mínimo de "Mi cuenta" (docs/eng/06 §2 nav) necesario para que el flujo de
// la API key (tarea 5.1) no sea de un solo uso: acá el cliente ve el estado
// de su key y puede reemplazarla. El resto de "Mi cuenta" (datos de la
// empresa, etc.) es de una fase posterior.
export default async function MiCuentaPage() {
  const usuario = await obtenerUsuarioActual();
  if (!usuario || usuario.rol !== "cliente") {
    redirect("/login");
  }

  const supabase = await crearClienteServidor();
  const [{ data: key }, contexto] = await Promise.all([
    supabase
      .from("api_keys_publicas")
      .select("id, proveedor, alias, key_last4, estado, created_at")
      .eq("estado", "activa")
      .maybeSingle(),
    obtenerContextoPortal(),
  ]);

  return (
    <AppShell
      rol="cliente"
      activeId="mi-cuenta"
      empresaNombre={contexto.empresaNombre}
      costoEstimadoClp={contexto.costoEstimadoClp}
      reclamosAbiertos={contexto.ticketsSinLeer}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text">Mi cuenta</h1>
          <p className="mt-1 text-text-muted">Tu conexión con el modelo de IA.</p>
        </div>
        <CerrarSesionBoton />
      </div>

      <div className="mt-6 max-w-md rounded-xl border border-border bg-surface p-6">
        <h2 className="text-sm font-semibold text-text-muted">API key</h2>

        {key ? (
          <div className="mt-3 flex items-center justify-between">
            <div>
              <p className="text-text">
                {key.proveedor} · ••••{key.key_last4 ?? "----"}
              </p>
              {key.alias && <p className="text-xs text-text-muted">{key.alias}</p>}
            </div>
            {/* Esta consulta solo trae filas con estado="activa" (el estado de
                la FILA en la BD); "valida" acá es el estado de CONEXIÓN que
                muestra el chip — hoy no hay verificación periódica (Fase 7+),
                así que toda key activa se muestra como "Key OK". */}
            <KeyStatusChip estado={"valida" as EstadoKey} />
          </div>
        ) : (
          <p className="mt-3 text-text-muted">Todavía no conectas una API key.</p>
        )}

        <div className="mt-4 flex flex-wrap gap-3">
          <ReemplazarApiKey />
          {key && <DesconectarApiKey id={key.id} />}
        </div>
      </div>
    </AppShell>
  );
}
