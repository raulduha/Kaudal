import { redirect } from "next/navigation";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { crearClienteServidor } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/AppShell";
import { CalculadoraAgentes } from "./CalculadoraAgentes";

// Tarea 7.2: la calculadora estática de tools/calculadora-agentes.html, ahora
// como pantalla real — con tarifas de verdad desde public.model_pricing (Fase
// 7.1) en vez del array de precios hardcodeado en el HTML.
export default async function CalculadoraPage() {
  const usuario = await obtenerUsuarioActual();
  if (!usuario || usuario.rol !== "operador") {
    redirect("/login");
  }

  const supabase = await crearClienteServidor();
  const { data: tarifas } = await supabase
    .from("model_pricing")
    .select("modelo, proveedor, input_usd_por_1k, output_usd_por_1k, fx_usd_clp")
    .eq("activo", true)
    .order("modelo");

  return (
    <AppShell rol="operador" activeId="calculadora" nombrePerfil={usuario.nombre ?? usuario.email}>
      <CalculadoraAgentes tarifas={tarifas ?? []} />
    </AppShell>
  );
}
