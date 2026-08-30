import { AdjuntoBoton } from "./AdjuntoBoton";
import { formatoTiempoRelativo } from "@/lib/formato/tiempo-relativo";
import type { AdjuntoGuardado } from "@/lib/tickets/adjuntos";

export interface MensajeHilo {
  id: string;
  autorRol: "cliente" | "operador";
  autorNombre: string;
  cuerpo: string;
  esInterno: boolean;
  adjuntos: AdjuntoGuardado[];
  creadoEn: string;
}

// docs/eng/08 §11: burbujas alineadas por ROL (cliente siempre a la
// izquierda, operador siempre a la derecha), no por "quién mira" — así el
// hilo se lee igual en el drawer del operador (9.2) y en el portal del
// cliente (9.1). La nota interna solo llega acá si el viewer es operador:
// RLS (`mensajes_participante`) ya la excluye del SELECT del cliente, así
// que este componente no necesita filtrarla de nuevo.
export function HiloMensajes({ ticketId, mensajes }: { ticketId: string; mensajes: MensajeHilo[] }) {
  if (mensajes.length === 0) {
    return <p className="py-6 text-center text-sm text-text-muted">Todavía no hay mensajes.</p>;
  }

  return (
    <ul className="flex flex-col gap-3 py-4">
      {mensajes.map((m) => (
        <li key={m.id} className={`flex ${m.autorRol === "operador" ? "justify-end" : "justify-start"}`}>
          <div
            className={`max-w-[85%] rounded-lg border p-3 text-sm ${
              m.esInterno
                ? "border-primary/30 bg-primary/10"
                : m.autorRol === "operador"
                  ? "border-border bg-surface-alt"
                  : "border-border bg-surface"
            }`}
          >
            <div className="flex items-center gap-2 text-xs text-text-muted">
              <span className="font-medium text-text">{m.autorNombre}</span>
              <span>·</span>
              <span>{formatoTiempoRelativo(m.creadoEn)}</span>
              {m.esInterno && <span className="rounded-pill bg-primary/20 px-2 py-0.5 text-[10px] font-semibold uppercase text-primary-text">Nota interna</span>}
            </div>
            <p className="mt-1.5 whitespace-pre-wrap text-text">{m.cuerpo}</p>
            {m.adjuntos.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {m.adjuntos.map((a, i) => (
                  <AdjuntoBoton key={i} ticketId={ticketId} ruta={a.ruta} nombre={a.nombre} />
                ))}
              </div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
