import { NextRequest } from "next/server";
import { z } from "zod";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { crearClienteServidor } from "@/lib/supabase/server";
import { verificarLimiteGenerico } from "@/lib/auth/rate-limit";
import { esMismoOrigen } from "@/lib/auth/same-origin";
import { cifrarApiKey, huellaApiKey, ultimos4 } from "@/lib/crypto/api-keys";
import { aBytea } from "@/lib/crypto/bytea";
import { formatoValido, probarApiKey, type Proveedor } from "@/lib/proveedores/validar-api-key";

// El body trae la API key en texto plano (solo en memoria de este request,
// nunca se loguea): docs/eng/03 §5.3 prohíbe loguear el body de este endpoint.
const Body = z.object({
  proveedor: z.enum(["anthropic", "openai", "otro"]),
  alias: z.string().trim().max(60).optional().or(z.literal("")),
  key: z.string().trim().min(8).max(400),
}).strict(); // docs/eng/03 §8: rechazar payloads no esperados, no sólo ignorarlos.

export async function POST(req: NextRequest) {
  // CSRF (mismo patrón que /api/auth/*): sin esto, un sitio hostil podía
  // forzar el POST desde el navegador de un cliente con sesión y reemplazarle
  // la API key — la anterior queda revocada y sus agentes se caen.
  // SameSite=Strict ya lo cubre hoy, esto es la segunda cerradura.
  if (!esMismoOrigen(req)) {
    return Response.json({ ok: false, error: "Solicitud no permitida." }, { status: 403 });
  }

  const usuario = await obtenerUsuarioActual();
  if (!usuario || usuario.rol !== "cliente") {
    return Response.json({ ok: false, error: "No tienes permiso para conectar una API key." }, { status: 403 });
  }

  const limite = verificarLimiteGenerico(`api-keys:${usuario.orgId}`, 10);
  if (!limite.permitido) {
    return Response.json(
      { ok: false, error: "Demasiados intentos. Espera un momento e intenta de nuevo." },
      { status: 429, headers: { "Retry-After": String(limite.retryAfterSeg) } }
    );
  }

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return Response.json({ ok: false, error: "Revisa los datos e intenta de nuevo." }, { status: 400 });
  }
  const { proveedor, key } = parsed.data;
  const alias = parsed.data.alias || undefined;

  if (!formatoValido(proveedor as Proveedor, key)) {
    return Response.json(
      { ok: false, error: `Esa clave no tiene el formato de ${proveedor}. Revísala.` },
      { status: 422 }
    );
  }

  const sirve = await probarApiKey(proveedor as Proveedor, key);
  if (!sirve) {
    return Response.json(
      { ok: false, error: "No pudimos conectar con esa clave. ¿La copiaste completa?" },
      { status: 422 }
    );
  }

  const blob = cifrarApiKey(key);
  const last4 = ultimos4(key);
  const fingerprint = huellaApiKey(key);

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .rpc("guardar_api_key_cliente", {
      p_proveedor: proveedor,
      p_key_ciphertext: aBytea(blob.ciphertext),
      p_key_iv: aBytea(blob.iv),
      p_key_auth_tag: aBytea(blob.authTag),
      p_key_version: blob.version,
      p_alias: alias ?? null,
      p_key_last4: last4,
      p_key_fingerprint: fingerprint,
    })
    .single();

  if (error || !data) {
    // Cupo por cliente dentro del propio RPC (app.exigir_cupo_api_keys) — es
    // el backstop que cubre a quien llame el RPC directo por PostgREST,
    // saltándose verificarLimiteGenerico de arriba. PostgREST traduce el
    // errcode PT429 a HTTP 429, pero supabase-js no lo distingue solo: hay
    // que mapearlo acá o el cliente ve un 500 genérico en vez de "espera un
    // poco" con el 429 correcto.
    if (error?.code === "PT429") {
      return Response.json({ ok: false, error: error.message }, { status: 429 });
    }
    // Nunca loguear `key`/`blob` acá — solo metadatos seguros.
    console.error("[POST /api/portal/api-keys] guardar_api_key_cliente falló", {
      proveedor,
      orgId: usuario.orgId,
      error: error?.message,
    });
    return Response.json({ ok: false, error: "No pudimos guardar tu API key. Intenta de nuevo." }, { status: 500 });
  }

  const fila = data as { id: string; proveedor: string; alias: string | null; key_last4: string | null; estado: string };
  return Response.json({
    ok: true,
    key: { id: fila.id, proveedor: fila.proveedor, alias: fila.alias, keyLast4: fila.key_last4, estado: fila.estado },
  });
}
