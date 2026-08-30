import { crearClienteServidor } from "@/lib/supabase/server";
import { EstadoAgente } from "@/components/ui/AgenteEstadoChip";

type ClienteSupabase = Awaited<ReturnType<typeof crearClienteServidor>>;

export interface AgenteClienteResumen {
  id: string;
  nombre: string;
  modelo: string | null;
  canal: string | null;
  estadoBackend: EstadoAgente;
  usosMes: number;
  costoMes: number;
  ultimaActividad: string | null;
}

/**
 * Agentes del cliente de sesión (vía `agentes_publicos`, que ya excluye lo
 * que el frontend nunca debe recibir — docs/eng/06 §10: URLs de
 * endpoint/health, secretos de auth) con su uso del mes y última actividad.
 * Se excluye `archivado`: es un agente retirado, el cliente no necesita
 * verlo en su portal (a diferencia del operador, que sí debe verlo en el
 * suyo). La última actividad se resuelve con una consulta por agente en vez
 * de una agregación SQL porque Supabase-JS no expone MAX(...) GROUP BY —
 * aceptable acá porque un cliente tiene pocos agentes (no cientos).
 */
export async function obtenerAgentesConUsoDelMes(
  supabase: ClienteSupabase,
  inicioMesIso: string
): Promise<AgenteClienteResumen[]> {
  const [{ data: agentes }, { data: usoDelMes }] = await Promise.all([
    supabase
      .from("agentes_publicos")
      .select("id, nombre, modelo_default, canal, estado")
      .is("deleted_at", null)
      .neq("estado", "archivado")
      .order("nombre"),
    supabase.from("uso_diario").select("agente_id, usos, costo_estimado").gte("dia", inicioMesIso),
  ]);

  const filas = agentes ?? [];

  const usoPorAgente = new Map<string, { usos: number; costo: number }>();
  for (const f of usoDelMes ?? []) {
    const actual = usoPorAgente.get(f.agente_id) ?? { usos: 0, costo: 0 };
    actual.usos += Number(f.usos);
    actual.costo += Number(f.costo_estimado);
    usoPorAgente.set(f.agente_id, actual);
  }

  const ultimaActividadPorAgente = new Map(
    await Promise.all(
      filas.map(async (a) => {
        const { data } = await supabase
          .from("registros_uso")
          .select("ocurrido_en")
          .eq("agente_id", a.id)
          .order("ocurrido_en", { ascending: false })
          .limit(1)
          .maybeSingle();
        return [a.id, data?.ocurrido_en ?? null] as const;
      })
    )
  );

  return filas.map((a) => ({
    id: a.id,
    nombre: a.nombre,
    modelo: a.modelo_default,
    canal: a.canal,
    estadoBackend: a.estado as EstadoAgente,
    usosMes: usoPorAgente.get(a.id)?.usos ?? 0,
    costoMes: usoPorAgente.get(a.id)?.costo ?? 0,
    ultimaActividad: ultimaActividadPorAgente.get(a.id) ?? null,
  }));
}
