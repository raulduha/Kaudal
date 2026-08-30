import { randomUUID } from "node:crypto";
import { crearClienteServidor } from "@/lib/supabase/server";

export const TAMANO_MAXIMO_BYTES = 10 * 1024 * 1024;
export const MAX_ADJUNTOS = 5;

// Coincide con `allowed_mime_types` del bucket `ticket-attachments`
// (migración 9.1/9.2) y con las extensiones de docs/eng/08 §7. Storage no ve
// la extensión real del archivo, solo el MIME que nosotros le mandamos — por
// eso esta validación vive en la app y no solo en el bucket (defensa en
// profundidad, no el único control).
const MIME_POR_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  pdf: "application/pdf",
  csv: "text/csv",
  txt: "text/plain",
  log: "text/plain",
  json: "application/json",
};

export interface AdjuntoGuardado {
  ruta: string;
  nombre: string;
  mime: string;
  tamano_bytes: number;
}

type ResultadoValidacion = { ok: true; mime: string } | { ok: false; error: string };

export function validarAdjunto(nombre: string, tamanoBytes: number): ResultadoValidacion {
  if (tamanoBytes <= 0) {
    return { ok: false, error: `"${nombre}" está vacío.` };
  }
  if (tamanoBytes > TAMANO_MAXIMO_BYTES) {
    return { ok: false, error: `"${nombre}" pesa más de 10 MB.` };
  }
  const extension = nombre.split(".").pop()?.toLowerCase() ?? "";
  const mime = MIME_POR_EXTENSION[extension];
  if (!mime) {
    return { ok: false, error: `"${nombre}": tipo de archivo no permitido. Usa png, jpg, pdf, csv, txt, log o json.` };
  }
  return { ok: true, mime };
}

function sanitizarNombreArchivo(nombre: string): string {
  const base = nombre.slice(-100).replace(/[^A-Za-z0-9._-]/g, "_");
  return base || "archivo";
}

// security-auditor (9.1, hallazgo BAJO-3): un nombre con caracteres de
// control/bidi (ej. un override RTL que hace ver "factura.png" a un archivo
// que en realidad termina en .exe) engaña al operador en el chip del hilo —
// la descarga usa `ruta` (ya sanitizada), pero la ETIQUETA mostraba el
// nombre crudo. Se limpian los caracteres de control/formato antes de
// guardar, sin tocar la validación de extensión (que ya lee del nombre
// crudo, antes de esto).
function limpiarNombreVisible(nombre: string): string {
  return nombre.replace(/\p{C}/gu, "").slice(0, 200);
}

export type VisibilidadAdjunto = "publico" | "interno";

/**
 * Sube 0..N archivos ya validados al bucket privado `ticket-attachments`, con
 * la ruta que exige la RLS de `storage.objects` (migración 9.1/9.2 +
 * 9.1-seguimiento): `{org_id}/{ticket_id}/{visibilidad}/{uuid}-{nombre}`.
 * Usa el cliente de sesión (no service_role) a propósito — la propia RLS del
 * bucket es la que autoriza, no un chequeo manual acá.
 *
 * `visibilidad` NO es cosmético: security-auditor encontró que sin un
 * segmento de ruta dedicado, un adjunto de una NOTA INTERNA (es_interno=true
 * en mensajes_ticket, que el cliente nunca debe ver — RLS de
 * mensajes_participante) caía en la misma carpeta que los adjuntos públicos
 * y quedaba legible por el cliente vía `storage.objects.select`/`list`, con
 * su JWT sacado del navegador. `"interno"` solo lo puede escribir/leer el
 * operador — lo exige `app.puede_tocar_adjunto_ticket` en la base, no esta
 * función. Quien llama (el Route Handler de mensajes) decide el valor según
 * `es_interno`, ya calculado ANTES del upload.
 */
export async function subirAdjuntosTicket(
  supabase: Awaited<ReturnType<typeof crearClienteServidor>>,
  orgId: string,
  ticketId: string,
  archivos: File[],
  visibilidad: VisibilidadAdjunto = "publico"
): Promise<{ ok: true; adjuntos: AdjuntoGuardado[] } | { ok: false; error: string }> {
  const adjuntos: AdjuntoGuardado[] = [];
  for (const archivo of archivos) {
    const validado = validarAdjunto(archivo.name, archivo.size);
    if (!validado.ok) return { ok: false, error: validado.error };

    // Los dos ids van en minúsculas a propósito: la RLS del bucket
    // (`app.puede_tocar_adjunto_ticket`) exige el uuid en FORMA CANÓNICA, para
    // que un mismo ticket no pueda tener dos carpetas distintas ("A0EE…" y
    // "a0ee…" castean al mismo uuid pero son strings distintos) y saltarse así
    // el tope de 30 objetos por ticket. `ticketId` llega del path validado con
    // `z.string().uuid()`, que acepta mayúsculas.
    const ruta = `${orgId.toLowerCase()}/${ticketId.toLowerCase()}/${visibilidad}/${randomUUID()}-${sanitizarNombreArchivo(archivo.name)}`;
    const { error } = await supabase.storage
      .from("ticket-attachments")
      .upload(ruta, archivo, { contentType: validado.mime, upsert: false });

    if (error) {
      // security-auditor: en un fallo parcial (archivo N de varios) los
      // anteriores ya quedaron subidos y no hay ninguna vía de borrado desde
      // la app (storage.objects no tiene policy de DELETE) — se deja rastro
      // de las rutas ya escritas para que una limpieza con service_role sepa
      // qué buscar, ya que no hay recolector automático.
      console.error("[subirAdjuntosTicket] falló la subida", {
        ticketId,
        error: error.message,
        rutasYaSubidas: adjuntos.map((a) => a.ruta),
      });
      return { ok: false, error: "No pudimos subir uno de tus archivos. Intenta de nuevo." };
    }

    adjuntos.push({ ruta, nombre: limpiarNombreVisible(archivo.name), mime: validado.mime, tamano_bytes: archivo.size });
  }
  return { ok: true, adjuntos };
}
