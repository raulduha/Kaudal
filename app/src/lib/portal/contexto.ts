import { crearClienteServidor } from "@/lib/supabase/server";

export interface ContextoPortal {
  empresaNombre: string;
  costoEstimadoClp: number;
  ticketsSinLeer: number;
}

export function inicioDeMesIso(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

/**
 * Nombre de la empresa + costo estimado del mes: el chrome fijo del topbar
 * en TODO el portal del cliente (docs/eng/06 §2: "Barra superior fija:
 * nombre de la empresa · costo estimado del mes ... siempre visibles").
 * Antes de la tarea 8.1 ninguna pantalla del portal pasaba estos props a
 * `AppShell` (quedaba en el fallback "Tu empresa" sin costo) — se corrige acá
 * de forma centralizada para que las 5 pantallas del portal queden
 * consistentes entre sí.
 *
 * Tarea 9.1: de paso trae `ticketsSinLeer` (tickets con al menos un mensaje
 * del operador que el cliente no vio) para el badge del ítem "Dudas y
 * reclamos" del nav (`AppShell` ya tenía el prop `reclamosAbiertos`, sin
 * dueño desde la 1.3). Se cuenta en JS porque PostgREST no da un `count
 * distinct` directo y la cantidad de tickets de un cliente es chica.
 */
export async function obtenerContextoPortal(): Promise<ContextoPortal> {
  const supabase = await crearClienteServidor();
  const [{ data: cliente }, { data: usoDelMes }, { data: mensajesSinLeer }] = await Promise.all([
    supabase.from("clientes").select("razon_social, nombre_fantasia").maybeSingle(),
    supabase.from("uso_diario").select("costo_estimado").gte("dia", inicioDeMesIso()),
    supabase.from("mensajes_ticket").select("ticket_id").eq("leido_por_cliente", false).eq("es_interno", false),
  ]);

  const costoEstimadoClp = (usoDelMes ?? []).reduce((acc, f) => acc + Number(f.costo_estimado), 0);
  const ticketsSinLeer = new Set((mensajesSinLeer ?? []).map((m) => m.ticket_id)).size;

  return {
    empresaNombre: cliente?.nombre_fantasia || cliente?.razon_social || "Tu empresa",
    costoEstimadoClp,
    ticketsSinLeer,
  };
}
