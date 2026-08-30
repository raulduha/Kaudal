import { AgenteClienteEstadoChip } from "./AgenteClienteEstadoChip";
import { EstadoClienteAgente } from "@/lib/agentes/estado-cliente";
import { formatoTiempoRelativo } from "@/lib/formato/tiempo-relativo";
import { cn } from "@/lib/cn";

const formatoClp = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });

export interface ClientAgentCardProps {
  nombre: string;
  modelo: string | null;
  estado: EstadoClienteAgente;
  usosMes: number;
  costoMes: number;
  ultimaActividad: string | null;
  className?: string;
}

/**
 * Tarjeta de "Mis agentes" del lado del CLIENTE (docs/eng/06 §5) — a
 * propósito NO es `AgentCard` (esa muestra `tipo` mastra/n8n/propio, un
 * detalle de implementación que rompería la regla de "caja negra: sin
 * exponer prompts/lógica") ni usa `AgenteEstadoChip` (vocabulario interno
 * del operador, no el de 3 estados que el cliente debe leer).
 */
export function ClientAgentCard({ nombre, modelo, estado, usosMes, costoMes, ultimaActividad, className }: ClientAgentCardProps) {
  const inicial = nombre.trim().charAt(0).toUpperCase() || "?";
  return (
    <article className={cn("rounded-lg border border-border bg-surface p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface-alt text-sm font-bold text-primary-text" aria-hidden="true">
            {inicial}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text">{nombre}</h3>
            {modelo && <p className="text-xs text-text-muted">{modelo}</p>}
          </div>
        </div>
        <AgenteClienteEstadoChip estado={estado} />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-center">
        <div>
          <dt className="text-xs text-text-muted">Uso este mes</dt>
          <dd className="mt-0.5 text-sm font-semibold text-text">{usosMes.toLocaleString("es-CL")}</dd>
        </div>
        <div>
          <dt className="text-xs text-text-muted">Costo estimado</dt>
          <dd className="mt-0.5 text-sm font-semibold text-text">{`≈ ${formatoClp.format(costoMes)}`}</dd>
        </div>
      </dl>

      <p className="mt-3 text-xs text-text-muted">
        {ultimaActividad ? `Última actividad: ${formatoTiempoRelativo(ultimaActividad)}` : "Todavía sin actividad"}
      </p>
    </article>
  );
}
