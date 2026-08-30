// security-auditor (9.1, re-revisión de MEDIO-2): la guardia original
// leía `content-length` y comparaba con `Number.isFinite` — pero
// `Number(null) === 0`, que ES finito, así que un request sin ese header
// (HTTP/2 lo puede omitir, o `Transfer-Encoding: chunked` no lo lleva nunca)
// pasaba la guardia con `largoCuerpo = 0` y llegaba a `req.formData()` sin
// ningún tope. El header nunca puede ser el ÚNICO control — acá se corta el
// stream mismo apenas supera el máximo, sin importar si el header mintió,
// faltó, o ni siquiera existe.
export const CUERPO_DEMASIADO_GRANDE = "CUERPO_DEMASIADO_GRANDE";

export function conCuerpoAcotado(req: Request, maxBytes: number): Request {
  const origen = req.body;
  if (!origen) return req;

  let vistos = 0;
  const contador = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      vistos += chunk.byteLength;
      if (vistos > maxBytes) {
        controller.error(new Error(CUERPO_DEMASIADO_GRANDE));
        return;
      }
      controller.enqueue(chunk);
    },
  });

  return new Request(req.url, {
    method: req.method,
    headers: req.headers,
    // @ts-expect-error -- undici (el runtime Node de Next) exige "half" para
    // un body de tipo stream; el tipo DOM de RequestInit no lo declara.
    duplex: "half",
    body: origen.pipeThrough(contador),
  });
}
