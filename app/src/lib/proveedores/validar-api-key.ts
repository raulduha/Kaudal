export type Proveedor = "anthropic" | "openai" | "otro";

// docs/eng/03 §2.2: formatos conocidos de key por proveedor.
const FORMATOS: Record<"anthropic" | "openai", RegExp> = {
  anthropic: /^sk-ant-[A-Za-z0-9_-]{20,}$/,
  openai: /^sk-(proj-)?[A-Za-z0-9_-]{20,}$/,
};

export function formatoValido(proveedor: Proveedor, key: string): boolean {
  const v = key.trim();
  if (proveedor === "otro") return v.length >= 8;
  return FORMATOS[proveedor].test(v);
}

/** Tope de espera del ping. Sin esto un proveedor colgado deja el request
 * de Kaudal abierto indefinidamente (la key en claro sigue en memoria todo
 * ese rato) y basta con provocarlo N veces para agotar el servidor. */
const TIMEOUT_MS = 8000;

/**
 * Opciones comunes del ping. Tres cosas deliberadas:
 *  - `redirect: "error"`: un 30x del proveedor (DNS/proxy secuestrado, o un
 *    día que la API redirija) haría que undici reenvíe los headers al destino
 *    nuevo. Sólo `Authorization` se descarta cross-origin por spec; `x-api-key`
 *    NO — o sea, la key de Anthropic viajaría a otro host. No seguimos saltos.
 *  - `cache: "no-store"`: Next.js parchea fetch global; una respuesta de
 *    validación cacheada por URL respondería por una key distinta a la probada.
 *  - `signal`: timeout duro (arriba).
 */
function opcionesPing(headers: Record<string, string>): RequestInit {
  return {
    method: "GET",
    headers,
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  };
}

/**
 * Ping barato al proveedor para confirmar que la key sirve (docs/eng/03 §2.2:
 * "hace un request barato de prueba... Si falla → 422, no se guarda"). Nunca
 * loguea la key. "otro" no tiene endpoint conocido: se acepta sin probar.
 */
export async function probarApiKey(proveedor: Proveedor, key: string): Promise<boolean> {
  const v = key.trim();
  try {
    if (proveedor === "anthropic") {
      const res = await fetch(
        "https://api.anthropic.com/v1/models",
        opcionesPing({ "x-api-key": v, "anthropic-version": "2023-06-01" })
      );
      return res.ok;
    }
    if (proveedor === "openai") {
      const res = await fetch(
        "https://api.openai.com/v1/models",
        opcionesPing({ Authorization: `Bearer ${v}` })
      );
      return res.ok;
    }
    return true; // "otro"
  } catch {
    // Sin internet, timeout, o el proveedor respondió un redirect: no podemos
    // afirmar que sirve. El error se traga a propósito y NO se loguea: su
    // mensaje puede incluir la URL/headers del request saliente.
    return false;
  }
}
