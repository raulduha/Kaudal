// Cliente HTTP mínimo para pegarle a `/api/portal/tickets` en el servidor de
// desarrollo real (`npm run dev`), a propósito y no a la función `POST`
// exportada en proceso: el bug que esta suite cubre (MEDIO-2 de la auditoría
// de 9.1 — `Number(null) === 0` dejaba pasar un body sin `content-length`)
// solo se manifiesta en el pipeline HTTP real de Next.js (incluye el techo
// de `middlewareClientMaxBodySize`, ver next.config.mjs), no llamando el
// handler directo desde Node.

export const BASE_URL = process.env.KAUDAL_TEST_BASE_URL ?? "http://localhost:3000";

export const MARCA_ASUNTO = "kaudal-portal-tickets-test";

/** Login real contra /api/auth/login; devuelve el header Cookie para reusar en requests siguientes. */
export async function loginCliente(): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "cliente@kaudal.local", password: "DevKaudal123!" }),
  });
  if (!res.ok) {
    throw new Error(
      `No se pudo iniciar sesión como cliente@kaudal.local (HTTP ${res.status}). ` +
        `¿Corriste "npm run seed:local"? ¿Está "npm run dev" arriba en ${BASE_URL}?`
    );
  }
  const cookies = res.headers.getSetCookie().map((c) => c.split(";")[0]);
  if (cookies.length === 0) {
    throw new Error("Login OK pero sin Set-Cookie — no se puede armar la sesión para el resto de la suite.");
  }
  return cookies.join("; ");
}

/**
 * Arma un multipart/form-data "a mano" (en vez de usar `FormData` del
 * navegador/undici) para poder mandarlo SIN header `Content-Length`, forzando
 * el camino de body streameado que expone el bug: `fetch` con un `FormData`
 * normal siempre calcula y manda `Content-Length`, así que nunca ejercitaría
 * la rama que falló (`Number(null) === 0`).
 */
export function multipartCrudo(campos: Record<string, string>, archivo?: { nombre: string; bytes: Uint8Array }) {
  const boundary = `----kaudalTestBoundary${Math.random().toString(16).slice(2)}`;
  const partes: (string | Uint8Array)[] = [];
  for (const [clave, valor] of Object.entries(campos)) {
    partes.push(`--${boundary}\r\nContent-Disposition: form-data; name="${clave}"\r\n\r\n${valor}\r\n`);
  }
  if (archivo) {
    partes.push(
      `--${boundary}\r\nContent-Disposition: form-data; name="archivos"; filename="${archivo.nombre}"\r\nContent-Type: application/octet-stream\r\n\r\n`
    );
    partes.push(archivo.bytes);
    partes.push("\r\n");
  }
  partes.push(`--${boundary}--\r\n`);

  const encoder = new TextEncoder();
  const buffers = partes.map((p) => (typeof p === "string" ? encoder.encode(p) : p));
  const total = buffers.reduce((acc, b) => acc + b.byteLength, 0);
  const cuerpo = new Uint8Array(total);
  let offset = 0;
  for (const b of buffers) {
    cuerpo.set(b, offset);
    offset += b.byteLength;
  }

  return { boundary, cuerpo };
}

/**
 * POST multipart contra /api/portal/tickets SIN Content-Length: usa un
 * `ReadableStream` como body — fetch/undici streamea eso con
 * `Transfer-Encoding: chunked` y jamás calcula el largo total de antemano,
 * igual que el escenario real que encontró security-auditor (cliente que
 * manda `Transfer-Encoding: chunked` a propósito, o simplemente detrás de un
 * proxy HTTP/2 que no reenvía el header).
 */
export async function crearTicketSinContentLength(cookie: string, cuerpo: Uint8Array, boundary: string): Promise<Response> {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(cuerpo);
      controller.close();
    },
  });
  return fetch(`${BASE_URL}/api/portal/tickets`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": `multipart/form-data; boundary=${boundary}` },
    body: stream,
    // @ts-expect-error -- undici exige "half" para un body de tipo stream; el tipo DOM no lo declara.
    duplex: "half",
  });
}
