/**
 * Rate limit en memoria para el login (docs/eng/03 §7: 5 intentos/min por
 * IP+usuario, con backoff/lockout progresivo). Memoria alcanza para un solo
 * proceso (local / Raspberry / una instancia Railway, docs/16 §despliegue);
 * si se escala a múltiples instancias hay que moverlo a Redis — anotado
 * como deuda, no bloqueante para el MVP de un solo operador.
 *
 * IMPORTANTE: la IP viene de `X-Forwarded-For`, que el cliente puede
 * falsificar (salvo que el proxy la reescriba). Por eso NO alcanza con un
 * bucket por IP+correo: rotando el header se evadía el lockout completo. Se
 * cuenta además un bucket por SOLO correo, que no depende de nada que el
 * atacante controle.
 */

const VENTANA_MS = 60_000;
/** Intentos por minuto desde una misma IP para un mismo correo (docs/eng/03 §7). */
const MAX_POR_IP_Y_CORREO = 5;
/**
 * Intentos por minuto contra un mismo correo desde cualquier IP. Más holgado
 * que el anterior a propósito: corta la fuerza bruta distribuida sin que sea
 * trivial dejar sin login al operador (el bloqueo por correo es, por
 * naturaleza, una superficie de DoS; se acota con lockout progresivo).
 */
const MAX_POR_CORREO = 10;
/** Tope del lockout progresivo: 30 ventanas = 30 min. */
const FACTOR_MAX = 30;
/** Cuánto se "recuerda" que una clave ya fue bloqueada, para escalar el castigo. */
const MEMORIA_BLOQUEOS_MS = 2 * 60 * 60 * 1000;

interface Bucket {
  intentos: number;
  desde: number;
  bloqueadoHasta?: number;
  /** Cuántas veces se bloqueó esta clave dentro de MEMORIA_BLOQUEOS_MS. */
  bloqueos: number;
  ultimoBloqueo?: number;
}

export type ResultadoLimite =
  | { permitido: true }
  | { permitido: false; retryAfterSeg: number };

const buckets = new Map<string, Bucket>();

// Evita que el Map crezca sin límite en un proceso de larga vida.
function limpiarViejos(ahora: number) {
  for (const [clave, b] of buckets) {
    const sinBloqueoActivo = !b.bloqueadoHasta || ahora > b.bloqueadoHasta;
    const sinHistorial = !b.ultimoBloqueo || ahora - b.ultimoBloqueo > MEMORIA_BLOQUEOS_MS;
    if (ahora - b.desde > VENTANA_MS * 10 && sinBloqueoActivo && sinHistorial) {
      buckets.delete(clave);
    }
  }
}

function evaluar(clave: string, maxIntentos: number, ahora: number): ResultadoLimite {
  const b = buckets.get(clave);
  if (!b) {
    buckets.set(clave, { intentos: 1, desde: ahora, bloqueos: 0 });
    return { permitido: true };
  }

  if (b.bloqueadoHasta && ahora < b.bloqueadoHasta) {
    return { permitido: false, retryAfterSeg: Math.ceil((b.bloqueadoHasta - ahora) / 1000) };
  }

  if (ahora - b.desde > VENTANA_MS) {
    // Ventana nueva. Se conserva el historial de bloqueos (si es reciente) para
    // que el lockout siga escalando: sin esto, esperar el bloqueo lo reseteaba
    // y el atacante recuperaba N intentos cada pocos minutos, para siempre.
    const olvidar = !b.ultimoBloqueo || ahora - b.ultimoBloqueo > MEMORIA_BLOQUEOS_MS;
    b.intentos = 1;
    b.desde = ahora;
    b.bloqueadoHasta = undefined;
    if (olvidar) {
      b.bloqueos = 0;
      b.ultimoBloqueo = undefined;
    }
    return { permitido: true };
  }

  b.intentos += 1;
  if (b.intentos > maxIntentos) {
    b.bloqueos += 1;
    b.ultimoBloqueo = ahora;
    const factor = Math.min(2 ** (b.bloqueos - 1), FACTOR_MAX);
    b.bloqueadoHasta = ahora + VENTANA_MS * factor;
    return { permitido: false, retryAfterSeg: Math.ceil((b.bloqueadoHasta - ahora) / 1000) };
  }

  return { permitido: true };
}

function claves(ip: string | null, email: string) {
  const correo = email.trim().toLowerCase();
  return { porCorreo: `correo:${correo}`, porIpYCorreo: `ip:${ip ?? "sin-ip"}:${correo}` };
}

/** Cuenta un intento de login y dice si se permite. Llamar una sola vez por request. */
export function verificarLimiteLogin(ip: string | null, email: string): ResultadoLimite {
  const ahora = Date.now();
  if (buckets.size > 5000) limpiarViejos(ahora);

  const { porCorreo, porIpYCorreo } = claves(ip, email);
  const resultadoCorreo = evaluar(porCorreo, MAX_POR_CORREO, ahora);
  if (!resultadoCorreo.permitido) return resultadoCorreo;
  return evaluar(porIpYCorreo, MAX_POR_IP_Y_CORREO, ahora);
}

/** Login exitoso: se limpia el historial de esa combinación. */
export function registrarExitoLogin(ip: string | null, email: string) {
  const { porCorreo, porIpYCorreo } = claves(ip, email);
  buckets.delete(porCorreo);
  buckets.delete(porIpYCorreo);
}

/** Solo para pruebas. */
export function reiniciarLimites() {
  buckets.clear();
  ventanasGenericas.clear();
}

/**
 * Límite genérico de ventana fija (sin el lockout progresivo de login, que no
 * tiene sentido para throttling de una API interna). docs/eng/03 §7:
 * "POST /api/keys y /test — 10/min por org". Memoria = deuda de escalamiento
 * ya documentada (rate-limit.ts, arriba).
 */
const ventanasGenericas = new Map<string, { intentos: number; desde: number }>();

/**
 * Tope de claves vivas. Los buckets con clave derivada del `org_id` de un
 * usuario autenticado están acotados por naturaleza, pero desde que hay
 * límites en bordes PÚBLICOS con clave derivada de la IP
 * (`usage-ip:<ip>`, /api/usage/events) la clave la controla en parte quien
 * llama: X-Forwarded-For es falsificable, así que sin poda este Map es un
 * camino directo a agotar la memoria del proceso mandando requests con un XFF
 * distinto cada vez.
 */
const MAX_VENTANAS = 10_000;

function podarVentanas(ahora: number) {
  for (const [clave, v] of ventanasGenericas) {
    if (ahora - v.desde > VENTANA_MS) ventanasGenericas.delete(clave);
  }
  // Si tras podar sigue lleno (todas las ventanas vigentes: pico real de
  // tráfico o ataque en curso) se vacía entero. Perder el conteo de un
  // minuto es preferible a quedarse sin memoria; el peor caso es que quien
  // ataca gane una ventana de gracia, no que pase inadvertido.
  if (ventanasGenericas.size >= MAX_VENTANAS) ventanasGenericas.clear();
}

export function verificarLimiteGenerico(clave: string, maxPorMinuto: number): ResultadoLimite {
  const ahora = Date.now();
  if (ventanasGenericas.size >= MAX_VENTANAS) podarVentanas(ahora);
  const v = ventanasGenericas.get(clave);
  if (!v || ahora - v.desde > VENTANA_MS) {
    ventanasGenericas.set(clave, { intentos: 1, desde: ahora });
    return { permitido: true };
  }
  v.intentos += 1;
  if (v.intentos > maxPorMinuto) {
    return { permitido: false, retryAfterSeg: Math.ceil((VENTANA_MS - (ahora - v.desde)) / 1000) };
  }
  return { permitido: true };
}
