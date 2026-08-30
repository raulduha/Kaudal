import { NextRequest } from "next/server";
import { z } from "zod";
import { createHash } from "crypto";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { verificarLimiteGenerico } from "@/lib/auth/rate-limit";

/**
 * `POST /usage/events` (docs/eng/07 §2.3, docs/eng/01 §5.1). Endpoint tipo
 * webhook: lo llama un AGENTE externo (Mastra/n8n/código propio), no un
 * navegador con sesión de Kaudal — se autentica con el `ingest_token` que
 * `POST /api/agentes` generó una sola vez (nunca es un JWT de Supabase Auth,
 * así que no hay `auth.uid()` acá: usamos el cliente admin/service_role para
 * resolver a qué agente/org/cliente pertenece el token, y de ahí en adelante
 * escribimos con esos IDs, nunca con lo que el body diga).
 *
 * Superficie expuesta a internet sin control de quién llama más allá del
 * token — mismo perfil de riesgo que "abuso del canal: spam/webhooks falsos"
 * de docs/04-seguridad-y-compliance.md §1. Controles: token de alta entropía
 * (192 bits, Fase 6) comparado por hash (nunca en claro ni en logs), rate
 * limit por agente, `Idempotency-Key` para que un reintento no duplique
 * costo, y body validado con Zod.
 */

/**
 * Identificador de API del modelo. Se acota por formato (no solo por largo)
 * porque este texto lo elige quien llama, se persiste en `registros_uso.modelo`
 * y despues se agrupa y se muestra en los paneles del operador y del cliente
 * (docs/eng/07 2.4): sin esto entran saltos de linea, caracteres de control o
 * un `=cmd|...` que se activa al exportar la planilla de uso a CSV.
 */
const MODELO_RE = /^[a-zA-Z0-9._:/-]{1,120}$/;

/**
 * Cotas superiores. No son validacion cosmetica: `registros_uso.tokens_*` es
 * bigint, `unidades` es integer y `costo_estimado` es numeric(14,4). Sin tope,
 * un `units: 3e9` o un `input_tokens: 1e20` desbordan la columna y Postgres
 * responde 22003 -> 500 por cada request (ruido y trabajo gratis para quien
 * abusa), y sobre todo permiten a un token legitimo envenenar la base del costo
 * estimado con cifras imposibles. Los topes son holgados respecto de cualquier
 * ejecucion real (10M de tokens, 1000 usos por evento) y el peor costo posible
 * con la tarifa mas cara sembrada queda muy por debajo del maximo de la columna.
 */
const MAX_TOKENS = 10_000_000;
const MAX_UNIDADES = 1_000;

/** Tope del jsonb libre. Ver MAX_BODY_BYTES: esto acota lo que se PERSISTE. */
const MAX_METADATA_BYTES = 8 * 1024;

/** Techo defensivo del costo por evento: `costo_estimado` es numeric(14,4). */
const MAX_COSTO_CLP = 999_999_999;

const Body = z
  .object({
    occurred_at: z.string().datetime({ offset: true }).optional(),
    model: z.string().trim().regex(MODELO_RE).optional(),
    input_tokens: z.number().int().min(0).max(MAX_TOKENS).optional(),
    output_tokens: z.number().int().min(0).max(MAX_TOKENS).optional(),
    units: z.number().int().positive().max(MAX_UNIDADES).optional(),
    status: z.enum(["ok", "error", "timeout"]).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9._:~+/=-]{1,255}$/;

/**
 * Tope del cuerpo. Los Route Handlers del App Router NO traen limite de tamano
 * (el `bodyParser.sizeLimit` de Next es de las API routes viejas): sin esto,
 * `req.json()` bufferea en memoria lo que sea que manden. Un evento de uso real
 * son unos cientos de bytes.
 */
const MAX_BODY_BYTES = 32 * 1024;

/** Ventana aceptable para `occurred_at` (ver donde se usa). */
const MAX_FUTURO_MS = 5 * 60 * 1000;
const MAX_PASADO_MS = 30 * 24 * 60 * 60 * 1000;

// La tabla guarda el origen en espanol (registros_uso.origen, esquema
// inicial); el contrato HTTP documentado (docs/eng/07 SS2.2/2.3) usa los
// valores en ingles del spec de usage_events. "estimado" siempre mapea a
// "estimated_event" (nunca "estimated_aggregate"): este endpoint por
// definicion recibe un evento por ejecucion, el modo "estimado agregado"
// (sin evento, solo conteo de webhooks) no aplica a este camino de ingesta.
const ORIGEN_A_SOURCE = {
  reportado: "reported",
  estimado: "estimated_event",
} as const;

// El agente reporta cada ejecución real: un tope bajo (como el 10/min de los
// endpoints operados por humanos) bloquearía tráfico legítimo de un agente
// ocupado. Este límite es un backstop de abuso, no el throttle normal de uso.
const LIMITE_POR_MINUTO = 120;

/**
 * Backstop por IP, ANTES de tocar la base. El limite por agente solo existe
 * despues de resolver el token, asi que por si solo no frena a quien manda
 * tokens al azar: cada intento fallido costaba un SELECT con service_role y no
 * se cobraba nada. Adivinar el token sigue siendo inviable (192 bits), lo que
 * este tope corta es el DoS/amplificacion contra Postgres.
 *
 * Holgado a proposito: una org con varios agentes ocupados sale por una sola IP
 * de egreso, y este limite es contra abuso, no el throttle normal.
 *
 * LIMITACION CONOCIDA: la IP viene de X-Forwarded-For, que se falsifica salvo
 * que el proxy de borde lo reescriba (ya anotado en lib/auth/rate-limit.ts).
 * Antes de produccion hay que (a) terminar TLS en un proxy que fije el XFF real
 * y (b) mover el contador a Redis si corre mas de una instancia.
 */
const LIMITE_POR_IP_POR_MINUTO = 600;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

type CuerpoLeido = { ok: true; texto: string } | { ok: false; motivo: "grande" | "ilegible" };

/**
 * Lee el cuerpo con tope duro. No basta con mirar Content-Length (se puede
 * mentir, y en `Transfer-Encoding: chunked` no viene): se corta el stream apenas
 * pasa del maximo.
 */
async function leerCuerpoAcotado(req: NextRequest, maxBytes: number): Promise<CuerpoLeido> {
  const declarado = Number(req.headers.get("content-length"));
  if (Number.isFinite(declarado) && declarado > maxBytes) return { ok: false, motivo: "grande" };
  if (!req.body) return { ok: true, texto: "" };

  const reader = req.body.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return { ok: false, motivo: "grande" };
      }
      partes.push(value);
    }
  } catch {
    return { ok: false, motivo: "ilegible" };
  }

  const buffer = new Uint8Array(total);
  let offset = 0;
  for (const parte of partes) {
    buffer.set(parte, offset);
    offset += parte.byteLength;
  }
  return { ok: true, texto: new TextDecoder().decode(buffer) };
}

export async function POST(req: NextRequest) {
  // Primero el tope por IP: es lo unico evaluable sin tocar la base, asi que va
  // antes de resolver el token (ver LIMITE_POR_IP_POR_MINUTO). Se cuenta a
  // todos por igual, con token valido o no, para no filtrar por el lado del
  // rate limit si un token existe.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const limiteIp = verificarLimiteGenerico(`usage-ip:${ip ?? "sin-ip"}`, LIMITE_POR_IP_POR_MINUTO);
  if (!limiteIp.permitido) {
    return Response.json(
      { error: "Demasiados eventos seguidos. Espera un momento." },
      { status: 429, headers: { "Retry-After": String(limiteIp.retryAfterSeg) } }
    );
  }

  const auth = req.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  if (!token) {
    return Response.json({ error: "Falta el token de ingesta." }, { status: 401 });
  }

  const admin = crearClienteAdmin();
  const tokenHash = hashToken(token);

  // service_role: no hay sesión de Supabase Auth para un agente externo, así
  // que esta es la única forma de resolver el token sin exponer el hash a
  // ninguna política RLS pensada para usuarios humanos.
  const { data: agente } = await admin
    .from("agentes")
    .select("id, org_id, cliente_id, modelo_default, estado")
    .eq("ingest_token_hash", tokenHash)
    .is("deleted_at", null)
    .maybeSingle();

  if (!agente) {
    // Mismo mensaje para "token con formato raro" y "token que no existe":
    // no darle a quien prueba tokens al azar ninguna pista.
    return Response.json({ error: "Token inválido." }, { status: 401 });
  }

  // Un agente pausado o archivado esta apagado por decision del operador: su
  // token deja de servir. Es ademas la UNICA via de revocacion que hoy existe
  // si un ingest_token se filtra (no hay rotacion todavia). `caido` NO se
  // rechaza a proposito: significa que el healthcheck falla, pero el agente
  // puede seguir ejecutando y perder ese uso seria peor.
  if (agente.estado === "pausado" || agente.estado === "archivado") {
    return Response.json({ error: "Este agente está desactivado." }, { status: 403 });
  }

  const limite = verificarLimiteGenerico(`usage:${agente.id}`, LIMITE_POR_MINUTO);
  if (!limite.permitido) {
    return Response.json(
      { error: "Demasiados eventos seguidos. Espera un momento." },
      { status: 429, headers: { "Retry-After": String(limite.retryAfterSeg) } }
    );
  }

  const idempotencyKeyHeader = req.headers.get("idempotency-key");
  if (idempotencyKeyHeader && !IDEMPOTENCY_KEY_RE.test(idempotencyKeyHeader)) {
    return Response.json({ error: "Idempotency-Key inválida." }, { status: 400 });
  }

  const cuerpo = await leerCuerpoAcotado(req, MAX_BODY_BYTES);
  if (!cuerpo.ok) {
    return cuerpo.motivo === "grande"
      ? Response.json({ error: "El evento es demasiado grande." }, { status: 413 })
      : Response.json({ error: "Revisa los datos del evento." }, { status: 400 });
  }

  let json: unknown = null;
  try {
    json = JSON.parse(cuerpo.texto);
  } catch {
    json = null;
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: "Revisa los datos del evento." }, { status: 400 });
  }
  const datos = parsed.data;

  // `metadata` es jsonb libre que se persiste tal cual. El tope de cuerpo ya lo
  // acota, pero se verifica aparte lo que de verdad queda guardado. El NUL se
  // rechaza aca y no en la base: Postgres no lo admite dentro de un texto jsonb
  // y devolveria un 500 opaco en vez de un 400 con causa.
  if (datos.metadata) {
    const serializada = JSON.stringify(datos.metadata);
    if (serializada.length > MAX_METADATA_BYTES || serializada.includes("\u0000")) {
      return Response.json({ error: "Revisa el campo metadata del evento." }, { status: 400 });
    }
  }

  // `occurred_at` lo pone quien llama (docs/eng/07 SS2.2) y decide en que
  // periodo cae el uso. Sin ventana, un token legitimo puede fechar un evento
  // en 2099 (queda fuera de todo reporte) o meterlo en un mes ya cerrado y
  // facturado. La ventana es holgada para no castigar reintentos tras una
  // caida larga ni relojes algo corridos.
  if (datos.occurred_at) {
    const ocurrido = Date.parse(datos.occurred_at);
    const ahora = Date.now();
    if (!Number.isFinite(ocurrido) || ocurrido > ahora + MAX_FUTURO_MS || ocurrido < ahora - MAX_PASADO_MS) {
      return Response.json({ error: "La fecha del evento está fuera de rango." }, { status: 400 });
    }
  }

  const tieneTokens = datos.input_tokens !== undefined || datos.output_tokens !== undefined;
  const origen: "reportado" | "estimado" = tieneTokens ? "reportado" : "estimado";
  // model_pricing.modelo esta normalizado a minusculas por CHECK (migracion
  // 20260827180000): sin bajar a minusculas aca, "Claude-Sonnet-4-5" del
  // agente no calzaria contra la fila sembrada "claude-sonnet-4-5" y el
  // estimador caeria en costo 0 en silencio, exactamente el fallo que ese
  // CHECK buscaba evitar del otro lado del cruce.
  const modeloCrudo = datos.model || agente.modelo_default || null;
  const modelo = modeloCrudo ? modeloCrudo.toLowerCase() : null;
  const tokensIn = datos.input_tokens ?? 0;
  const tokensOut = datos.output_tokens ?? 0;
  const unidades = datos.units ?? 1;

  // Sin perfil de tokens promedio por agente todavía (docs/eng/07 §3.3, no
  // construido) no hay cómo estimar costo cuando el agente no reporta
  // tokens: se guarda el uso igual (para que "cuántas veces se usó" no se
  // pierda) con costo 0 en vez de inventar un número.
  let costoEstimadoClp = 0;
  if (modelo && tieneTokens) {
    const { data: tarifa } = await admin
      .from("model_pricing")
      .select("input_usd_por_1k, output_usd_por_1k, fx_usd_clp")
      .eq("modelo", modelo)
      .eq("activo", true)
      .maybeSingle();
    if (tarifa) {
      const costoUsd = (tokensIn / 1000) * tarifa.input_usd_por_1k + (tokensOut / 1000) * tarifa.output_usd_por_1k;
      const bruto = Math.round(costoUsd * tarifa.fx_usd_clp * unidades * 10000) / 10000;
      // costo_estimado es numeric(14,4): pasarse revienta el INSERT con 22003.
      // Las cotas de tokens/unidades ya lo hacen imposible con las tarifas
      // sembradas; este clamp cubre el dia que se cargue una tarifa absurda por
      // error, para que el evento igual se guarde.
      costoEstimadoClp = Number.isFinite(bruto) ? Math.min(Math.max(bruto, 0), MAX_COSTO_CLP) : 0;
    }
  }

  const { data: creado, error } = await admin
    .from("registros_uso")
    .insert({
      org_id: agente.org_id,
      cliente_id: agente.cliente_id,
      agente_id: agente.id,
      ocurrido_en: datos.occurred_at ?? new Date().toISOString(),
      modelo,
      tokens_in: tieneTokens ? tokensIn : null,
      tokens_out: tieneTokens ? tokensOut : null,
      unidades,
      costo_estimado: costoEstimadoClp,
      origen,
      status: datos.status ?? "ok",
      metadata: datos.metadata ?? {},
      idempotency_key: idempotencyKeyHeader || null,
    })
    .select("id, origen, costo_estimado")
    .single();

  if (error) {
    // 23505 = choque con el único de idempotencia: es un reintento del mismo
    // evento, no un error — se responde con el registro que ya existe.
    if (error.code === "23505" && idempotencyKeyHeader) {
      const { data: existente } = await admin
        .from("registros_uso")
        .select("id, origen, costo_estimado")
        .eq("agente_id", agente.id)
        .eq("idempotency_key", idempotencyKeyHeader)
        .maybeSingle();
      if (existente) {
        return Response.json(
          {
            id: existente.id,
            source: ORIGEN_A_SOURCE[existente.origen as keyof typeof ORIGEN_A_SOURCE],
            estimated_cost_clp: existente.costo_estimado,
          },
          { status: 202 }
        );
      }
    }
    console.error("[POST /api/usage/events] insert falló", { agenteId: agente.id, error: error.message });
    return Response.json({ error: "No pudimos registrar el uso." }, { status: 500 });
  }

  return Response.json(
    {
      id: creado.id,
      source: ORIGEN_A_SOURCE[creado.origen as keyof typeof ORIGEN_A_SOURCE],
      estimated_cost_clp: creado.costo_estimado,
    },
    { status: 202 }
  );
}
