import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export type AuthTipo = "none" | "bearer" | "header_key";

export interface ConexionAgente {
  url: string;
  authTipo: AuthTipo;
  authSecreto?: string; // texto plano, solo en memoria de este request
  authHeaderNombre?: string;
}

/** Por que fallo, para que quien llama decida (400/422 vs. estado caido). */
export type MotivoFalla = "url_invalida" | "destino_interno" | "auth_invalida" | "sin_respuesta";

export interface ResultadoConexion {
  ok: boolean;
  status?: number;
  error?: string;
  motivo?: MotivoFalla;
}

const TIMEOUT_MS = 8000;
const MAX_LARGO_URL = 2048;

// ---------------------------------------------------------------------------
// Anti-SSRF
//
// La url la escribe el operador a mano y el fetch sale desde el SERVIDOR de
// Kaudal, con sus privilegios de red. Sin control, "probar conexion" es un
// proxy hacia todo lo que el servidor alcanza y el operador no: el endpoint de
// metadatos de la nube (169.254.169.254 -> credenciales IAM -> la base de TODOS
// los tenants), Supabase/Postgres en la red interna, el panel de admin del
// host. Que hoy solo el operador llegue aca no lo vuelve aceptable: es
// exactamente el salto que convierte "una sesion de operador robada" en
// "plataforma completa comprometida", y el status que devolvemos es un oraculo
// para escanear puertos internos.
//
// Exigir https:// (Zod) NO alcanza: un dominio propio con un registro A a
// 127.0.0.1 es https y apunta adentro. Por eso se resuelve el hostname ANTES
// del fetch y se exige que TODAS las IPs resueltas sean unicast publico.
//
// Residual conocido: DNS rebinding (que la respuesta cambie entre esta
// resolucion y la que hace undici al conectar). Cerrarlo del todo exige un
// dispatcher de undici con connect.lookup propio; queda anotado como deuda.
// Con redirect: "error" + esta validacion, el atacante necesita ademas
// controlar un DNS con TTL ~0 y ganar una carrera, para un oraculo ciego.
// ---------------------------------------------------------------------------

function ipv4ANumero(ip: string): number | null {
  const partes = ip.split(".");
  if (partes.length !== 4) return null;
  let n = 0;
  for (const p of partes) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n >>> 0;
}

/** Rangos IPv4 que nunca son un endpoint de agente legitimo en internet. */
const RANGOS_V4_PROHIBIDOS: ReadonlyArray<readonly [string, number]> = [
  ["0.0.0.0", 8], // "this network"
  ["10.0.0.0", 8], // RFC1918
  ["100.64.0.0", 10], // CGNAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local: incluye el metadata endpoint de la nube
  ["172.16.0.0", 12], // RFC1918
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // documentacion
  ["192.88.99.0", 24], // 6to4 relay anycast
  ["192.168.0.0", 16], // RFC1918
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // documentacion
  ["203.0.113.0", 24], // documentacion
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reservado + broadcast
];

function esIpv4Publica(ip: string): boolean {
  const n = ipv4ANumero(ip);
  if (n === null) return false; // no parsea -> falla cerrado
  return !RANGOS_V4_PROHIBIDOS.some(([base, bits]) => {
    const b = ipv4ANumero(base);
    if (b === null) return false;
    const mascara = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return ((n & mascara) >>> 0) === ((b & mascara) >>> 0);
  });
}

/**
 * IPv6 al reves que IPv4: lista blanca. Solo 2000::/3 (global unicast) pasa,
 * asi que ::1, fe80::/10, fc00::/7, ff00::/8 y ::ffff:127.0.0.1 (IPv4-mapped)
 * quedan fuera sin tener que enumerarlos. Ademas se descartan los prefijos que
 * ENCAPSULAN una IPv4 (6to4, Teredo): esa IPv4 podria ser interna y no la
 * estamos mirando.
 */
function esIpv6Publica(ip: string): boolean {
  const dir = ip.split("%")[0].toLowerCase(); // sin zona (fe80::1%eth0)
  const grupos = dir.split(":");
  const primera = grupos[0];
  if (!/^[0-9a-f]{1,4}$/.test(primera)) return false; // "::1", "::ffff:..." etc.
  const h = parseInt(primera, 16);
  if (h < 0x2000 || h > 0x3fff) return false; // fuera de 2000::/3
  if (h === 0x2002) return false; // 6to4: lleva una IPv4 adentro
  if (h === 0x2001) {
    const segunda = grupos[1] ?? "";
    const s = segunda === "" ? 0 : parseInt(segunda, 16);
    if (Number.isNaN(s)) return false;
    if (s === 0x0000) return false; // Teredo 2001::/32: lleva una IPv4 adentro
    if (s === 0x0db8) return false; // documentacion
  }
  return true;
}

function rechazo(motivo: MotivoFalla, error: string): ResultadoConexion {
  return { ok: false, motivo, error };
}

const URL_INTERNA =
  "Esa URL apunta a una direccion interna de la red. Usa un dominio publico, accesible desde internet.";
const URL_MALA = "Esa URL no sirve. Tiene que empezar con https:// y apuntar a un dominio publico.";

/**
 * Se puede apuntar Kaudal a esta URL? https, sin credenciales embebidas, y con
 * TODAS sus IPs resueltas en rango publico. Exportada aparte de
 * probarConexionAgente porque endpoint_url tambien hay que validarla aunque el
 * ping se haga contra health_url: es la URL que Kaudal va a invocar despues.
 */
export async function urlDeAgentePermitida(url: string): Promise<ResultadoConexion> {
  if (url.length > MAX_LARGO_URL) return rechazo("url_invalida", URL_MALA);

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return rechazo("url_invalida", URL_MALA);
  }

  if (parsed.protocol !== "https:") return rechazo("url_invalida", URL_MALA);
  // user:pass@host: confunde a los parsers y filtra credenciales en logs/Referer.
  if (parsed.username || parsed.password) return rechazo("url_invalida", URL_MALA);

  const host = parsed.hostname.startsWith("[") ? parsed.hostname.slice(1, -1) : parsed.hostname;
  if (!host) return rechazo("url_invalida", URL_MALA);

  const familiaLiteral = isIP(host);
  let direcciones: Array<{ address: string; family: number }>;
  if (familiaLiteral) {
    direcciones = [{ address: host, family: familiaLiteral }];
  } else {
    try {
      direcciones = await lookup(host, { all: true, verbatim: true });
    } catch {
      // No resuelve: no podemos afirmar que es publica -> falla cerrado.
      return rechazo("sin_respuesta", "No pudimos resolver ese dominio. Revisa la URL.");
    }
  }

  if (direcciones.length === 0) return rechazo("destino_interno", URL_INTERNA);
  for (const d of direcciones) {
    const publica = d.family === 4 ? esIpv4Publica(d.address) : esIpv6Publica(d.address);
    if (!publica) return rechazo("destino_interno", URL_INTERNA);
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Armado de la cabecera de auth
//
// El nombre lo valida Zod y el CHECK de la BD, pero esta funcion tambien la va
// a llamar el job de healthcheck con lo que YA esta guardado, asi que se
// revalida aca: es la ultima capa antes de que el valor entre a un header HTTP
// saliente. El VALOR (el secreto) hasta ahora no se validaba: undici tira
// TypeError ante un CR/LF y el ping fallaba con un error generico, dejando un
// secreto imposible de usar guardado y cifrado para siempre.
// ---------------------------------------------------------------------------

const NOMBRE_HEADER_OK = /^[A-Za-z0-9_-]{1,64}$/;
/** Cabeceras de control del transporte: sobreescribirlas cambia a donde o como va el request. */
const HEADERS_RESERVADOS = new Set([
  "host",
  "connection",
  "content-length",
  "transfer-encoding",
  "cookie",
  "upgrade",
  "proxy-authorization",
]);
/** field-value de HTTP: ASCII visible + espacio/tab. Sin CR, LF ni NUL. */
const VALOR_HEADER_OK = /^[\x20-\x7e\t]+$/;

export function headerNombreValido(nombre: string): boolean {
  return NOMBRE_HEADER_OK.test(nombre) && !HEADERS_RESERVADOS.has(nombre.toLowerCase());
}

export function headerValorValido(valor: string): boolean {
  return VALOR_HEADER_OK.test(valor);
}

/**
 * Ping server-side al endpoint/health_url de un agente (docs/eng/01 4.2,
 * docs/eng/05 10 "Probar conexion"). Protecciones, en orden:
 *  - urlDeAgentePermitida: anti-SSRF (ver arriba).
 *  - redirect "error": un 30x reenviaria el header de auth a otro host y
 *    ademas saltaria la validacion de IP de arriba.
 *  - cache "no-store": Next.js parchea el fetch global; una respuesta cacheada
 *    por URL responderia por una conexion distinta a la probada.
 *  - signal: timeout duro.
 */
export async function probarConexionAgente(conexion: ConexionAgente): Promise<ResultadoConexion> {
  const permitida = await urlDeAgentePermitida(conexion.url);
  if (!permitida.ok) return permitida;

  const headers: Record<string, string> = {};
  if (conexion.authTipo !== "none") {
    const secreto = conexion.authSecreto ?? "";
    if (!headerValorValido(secreto)) {
      return rechazo(
        "auth_invalida",
        "El secreto de autenticacion tiene caracteres que no se pueden enviar en una cabecera HTTP."
      );
    }
    if (conexion.authTipo === "bearer") {
      headers["Authorization"] = "Bearer " + secreto;
    } else {
      const nombre = conexion.authHeaderNombre ?? "";
      if (!headerNombreValido(nombre)) {
        return rechazo("auth_invalida", "Ese nombre de cabecera no se puede usar. Prueba con algo como X-API-Key.");
      }
      headers[nombre] = secreto;
    }
  }

  try {
    const res = await fetch(conexion.url, {
      method: "GET",
      headers,
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // Sin esto el socket queda tomado hasta que pase el GC: nunca leemos el body.
    await res.body?.cancel().catch(() => {});
    return { ok: res.ok, status: res.status };
  } catch {
    // Nunca loguear el error crudo aca arriba: puede traer la URL con
    // credenciales si alguien las puso en la query string por error.
    return rechazo("sin_respuesta", "No pudimos llegar al endpoint. Revisa la URL o la autenticacion.");
  }
}
