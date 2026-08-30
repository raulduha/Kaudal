import { NextRequest } from "next/server";
import { z } from "zod";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { esMismoOrigen } from "@/lib/auth/same-origin";
import { verificarLimiteGenerico } from "@/lib/auth/rate-limit";
import { crearClienteServidor } from "@/lib/supabase/server";
import { cifrarApiKey } from "@/lib/crypto/api-keys";
import { aBytea } from "@/lib/crypto/bytea";
import { generarIngestToken } from "@/lib/crypto/ingest-token";
import {
  probarConexionAgente,
  urlDeAgentePermitida,
  headerValorValido,
} from "@/lib/agentes/probar-conexion";

const Body = z
  .object({
    clienteId: z.string().uuid(),
    nombre: z.string().trim().min(1).max(200),
    descripcion: z.string().trim().max(2000).optional().or(z.literal("")),
    tipo: z.enum(["mastra", "n8n", "custom"]),
    endpointUrl: z
      .string()
      .trim()
      .url()
      .refine((v) => v.startsWith("https://"), "La URL debe ser https."),
    healthUrl: z
      .string()
      .trim()
      .url()
      .refine((v) => v.startsWith("https://"), "La URL debe ser https.")
      .optional()
      .or(z.literal("")),
    authTipo: z.enum(["none", "bearer", "header_key"]),
    // El secreto va a terminar dentro de una cabecera HTTP saliente: se acota
    // al field-value de HTTP (sin CR/LF/NUL) ANTES de cifrarlo y guardarlo, o
    // quedaria un secreto imposible de usar, cifrado y para siempre, en la BD.
    authSecreto: z
      .string()
      .trim()
      .max(400)
      .refine(headerValorValido, "El secreto tiene caracteres que no se pueden enviar en una cabecera HTTP.")
      .optional()
      .or(z.literal("")),
    authHeaderNombre: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_-]{1,64}$/)
      .optional()
      .or(z.literal("")),
    modeloDefault: z.string().trim().max(120).optional().or(z.literal("")),
    metodoReporte: z.enum(["estimado", "reportado"]),
    canal: z.enum(["whatsapp", "web", "api", "otro"]).optional(),
    apiKeyId: z.string().uuid().optional(),
  })
  .strict();

export async function POST(req: NextRequest) {
  // CSRF (mismo patron que /api/auth/* y /api/portal/api-keys).
  if (!esMismoOrigen(req)) {
    return Response.json({ ok: false, error: "Solicitud no permitida." }, { status: 403 });
  }

  // Chequeo manual de rol: es la primera puerta y da el mensaje humano. La
  // autorizacion REAL la da la policy agentes_operador (org_id =
  // app.current_org_id() and app.current_rol() = 'operador', con WITH CHECK) al
  // insertar con el cliente de sesion. Si esta linea se borrara, el INSERT
  // seguiria fallando por RLS.
  const usuario = await obtenerUsuarioActual();
  if (!usuario || usuario.rol !== "operador") {
    return Response.json({ ok: false, error: "No tienes permiso para registrar agentes." }, { status: 403 });
  }

  // docs/eng/03 7: esta ruta tambien dispara un fetch saliente (el ping previo
  // a persistir), asi que lleva el mismo tope que /probar-conexion.
  const limite = verificarLimiteGenerico(`agentes-crear:${usuario.orgId}`, 10);
  if (!limite.permitido) {
    return Response.json(
      { ok: false, error: "Demasiados intentos seguidos. Espera un momento e intenta de nuevo." },
      { status: 429, headers: { "Retry-After": String(limite.retryAfterSeg) } }
    );
  }

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Revisa los datos e intenta de nuevo." },
      { status: 400 }
    );
  }
  const datos = parsed.data;

  if (datos.authTipo !== "none" && !datos.authSecreto) {
    return Response.json({ ok: false, error: "Falta el secreto de autenticacion." }, { status: 400 });
  }
  if (datos.authTipo === "header_key" && !datos.authHeaderNombre) {
    return Response.json({ ok: false, error: "Falta el nombre del header." }, { status: 400 });
  }

  const healthUrl = datos.healthUrl || undefined;

  // Anti-SSRF antes de guardar NADA: se validan las dos URLs, no solo la que se
  // va a pinguear. endpoint_url queda persistida y el healthcheck periodico (y
  // manana la invocacion del agente) la van a usar igual, asi que dejar entrar
  // una que apunte a la red interna es sembrar el SSRF para despues.
  for (const url of [datos.endpointUrl, healthUrl]) {
    if (!url) continue;
    const permitida = await urlDeAgentePermitida(url);
    if (!permitida.ok && permitida.motivo !== "sin_respuesta") {
      return Response.json({ ok: false, error: permitida.error }, { status: 422 });
    }
  }

  const resultadoPing = await probarConexionAgente({
    url: healthUrl ?? datos.endpointUrl,
    authTipo: datos.authTipo,
    authSecreto: datos.authSecreto || undefined,
    authHeaderNombre: datos.authHeaderNombre || undefined,
  });

  const filaAuth =
    datos.authTipo === "none" || !datos.authSecreto
      ? {
          auth_tipo: "none" as const,
          auth_ciphertext: null,
          auth_iv: null,
          auth_tag: null,
          auth_version: null,
          auth_header_nombre: null,
        }
      : (() => {
          const blob = cifrarApiKey(datos.authSecreto!);
          return {
            auth_tipo: datos.authTipo,
            auth_ciphertext: aBytea(blob.ciphertext),
            auth_iv: aBytea(blob.iv),
            auth_tag: aBytea(blob.authTag),
            auth_version: blob.version,
            auth_header_nombre: datos.authTipo === "header_key" ? datos.authHeaderNombre : null,
          };
        })();

  let ingestToken: string | null = null;
  let ingestTokenHash: string | null = null;
  if (datos.metodoReporte === "reportado") {
    const generado = generarIngestToken();
    ingestToken = generado.token;
    ingestTokenHash = generado.hash;
  }

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("agentes")
    .insert({
      org_id: usuario.orgId,
      cliente_id: datos.clienteId,
      nombre: datos.nombre,
      descripcion: datos.descripcion || null,
      tipo: datos.tipo,
      endpoint_url: datos.endpointUrl,
      health_url: healthUrl ?? null,
      metodo_reporte: datos.metodoReporte,
      modelo_default: datos.modeloDefault || null,
      api_key_id: datos.apiKeyId ?? null,
      canal: datos.canal ?? null,
      ingest_token_hash: ingestTokenHash,
      estado: resultadoPing.ok ? "activo" : "caido",
      ultimo_healthcheck_en: new Date().toISOString(),
      ultimo_healthcheck_ok: resultadoPing.ok,
      ...filaAuth,
    })
    // select * sobre agentes esta denegado por diseno para authenticated: las
    // columnas auth_* y ingest_token_hash no estan en el GRANT. Columnas
    // explicitas, nunca *.
    .select("id, nombre, tipo, estado, canal, modelo_default, metodo_reporte")
    .single();

  if (error || !data) {
    // Solo metadatos seguros: ni el secreto, ni el blob cifrado, ni el ingest
    // token pueden aparecer en un log.
    console.error("[POST /api/agentes] insert fallo", {
      orgId: usuario.orgId,
      clienteId: datos.clienteId,
      error: error?.message,
    });
    return Response.json({ ok: false, error: "No pudimos registrar el agente. Intenta de nuevo." }, { status: 500 });
  }

  return Response.json({
    ok: true,
    agente: {
      id: data.id,
      nombre: data.nombre,
      tipo: data.tipo,
      estado: data.estado,
      canal: data.canal,
      modeloDefault: data.modelo_default,
      metodoReporte: data.metodo_reporte,
    },
    conexion: resultadoPing,
    // Se muestra UNA sola vez: en la base solo queda el hash.
    ingestToken,
  });
}
