import { redirect } from "next/navigation";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { crearClienteServidor } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { RegistrarAgenteWizard } from "./RegistrarAgenteWizard";

export default async function RegistrarAgentePage() {
  const usuario = await obtenerUsuarioActual();
  if (!usuario || usuario.rol !== "operador") {
    redirect("/login");
  }

  const supabase = await crearClienteServidor();
  const { data: clientes } = await supabase
    .from("clientes")
    .select("id, razon_social")
    .is("deleted_at", null)
    .order("razon_social");

  return (
    <AppShell rol="operador" activeId="agentes">
      <RegistrarAgenteWizard clientes={clientes ?? []} />
    </AppShell>
  );
}
