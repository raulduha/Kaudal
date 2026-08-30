import { EstadoAgente } from "@/components/ui/AgenteEstadoChip";

export type EstadoClienteAgente = "funcionando" | "sin_uso_reciente" | "con_problemas";

// docs/eng/06 §5: "Sin uso reciente" es "no hay actividad en X tiempo (no es
// un error)" — deliberadamente sin exponer este umbral al cliente como una
// cifra técnica, solo como el estado amarillo.
const VENTANA_SIN_USO_MS = 48 * 60 * 60 * 1000;

/**
 * Traduce el vocabulario interno de `agentes.estado` (activo/pausado/caido)
 * al vocabulario de 3 estados que ve el cliente (docs/eng/06 §5). `pausado`
 * es una acción deliberada del operador, no una falla — se muestra como
 * "sin uso reciente" en vez de alarmar con "con problemas".
 */
export function calcularEstadoCliente(
  estadoBackend: EstadoAgente,
  ultimaActividad: string | null,
  ahora: Date = new Date()
): EstadoClienteAgente {
  if (estadoBackend === "caido") return "con_problemas";
  if (estadoBackend === "pausado") return "sin_uso_reciente";
  if (!ultimaActividad) return "sin_uso_reciente";

  const transcurrido = ahora.getTime() - new Date(ultimaActividad).getTime();
  return transcurrido <= VENTANA_SIN_USO_MS ? "funcionando" : "sin_uso_reciente";
}
