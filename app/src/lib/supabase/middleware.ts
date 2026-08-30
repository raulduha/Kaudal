import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { OPCIONES_COOKIE_SESION } from "./cookie-options";

/**
 * Refresca la sesión (access token via refresh token rotativo) en cada
 * request y protege las rutas que no son públicas. Se llama desde
 * `middleware.ts` en la raíz de `app/`.
 *
 * docs/eng/03 §5.3: refresh token rotativo en cookie HttpOnly + Secure +
 * SameSite=Strict — eso lo maneja @supabase/ssr internamente al leer/escribir
 * las cookies vía este adaptador. Nunca tocamos el token directamente.
 */
/**
 * Rutas públicas EXACTAS: solo esa ruta queda fuera del gate de auth, nada de
 * lo que cuelgue debajo. Se separan de los prefijos a propósito: con una lista
 * única por prefijo, cualquier ruta futura (`/invitacion/algo`,
 * `/login/olvide`) quedaba pública sin que nadie lo decidiera.
 *
 * /auth/confirmar: canjea el token de invitación (u otro link OTP por correo)
 * ANTES de que exista cualquier sesión — tiene que ser alcanzable sin cookie.
 * /api/usage/events: webhook de ingesta (docs/eng/07 §2.3) — lo llama un AGENTE
 * externo con su propio `ingest_token` (Bearer), nunca con la cookie de sesión,
 * así que el gate de cookie lo rechazaría con "Necesitas iniciar sesión" antes
 * de que la ruta alcance a mirar el token. Va acá y NO como prefijo
 * `/api/usage`: el resto de esa familia (`/api/usage/summary`, `/by-day`,
 * `/where` — docs/eng/07 §2.4) son lecturas del operador/cliente y tienen que
 * seguir exigiendo sesión. Un prefijo las habría dejado públicas el día que se
 * creen, sin que nadie lo decida. Esta única ruta hace su propia
 * autenticación/autorización — ver src/app/api/usage/events/route.ts.
 * /invitacion: la visita justo después de /auth/confirmar YA trae sesión
 * (verifyOtp la dejó puesta), así que además de estar acá tiene que quedar
 * exenta del particionado por rol de abajo (ver ese bloque) — si no, un
 * cliente recién confirmado rebotaría a /portal antes de poder fijar su
 * contraseña.
 */
const RUTAS_PUBLICAS_EXACTAS = ["/login", "/invitacion", "/auth/confirmar", "/api/usage/events"];

/**
 * Públicas incluyendo todo lo anidado debajo. Agregar acá es peligroso: deja
 * fuera del gate de auth TODA ruta futura bajo ese prefijo. Si lo que necesitas
 * exponer es un endpoint puntual, va en RUTAS_PUBLICAS_EXACTAS.
 */
const PREFIJOS_PUBLICOS = ["/api/auth"];

function esRutaPublica(pathname: string): boolean {
  // Sin normalizar, "/login/" no calzaría el match exacto y terminaría en el
  // gate de auth (redirect de más, no un agujero).
  const ruta = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  if (RUTAS_PUBLICAS_EXACTAS.includes(ruta)) return true;
  return PREFIJOS_PUBLICOS.some((r) => ruta === r || ruta.startsWith(r + "/"));
}

/**
 * Tarea 3.2: rutas por rol. El portal del cliente vive bajo `/portal`
 * (docs/eng/06); todo lo demás dentro del gate de auth es del operador
 * (docs/eng/05). Las rutas de API (`/api/*`, salvo `/api/auth`) no se
 * particionan por rol todavía — hoy no hay ningún endpoint específico de un
 * solo rol; eso se resuelve caso a caso cuando Fase 4+ agregue endpoints
 * reales, no de forma genérica acá.
 */
const PREFIJO_CLIENTE = "/portal";

function esRutaDeCliente(pathname: string): boolean {
  return pathname === PREFIJO_CLIENTE || pathname.startsWith(PREFIJO_CLIENTE + "/");
}

function inicioParaRol(rol: "operador" | "cliente"): string {
  return rol === "cliente" ? PREFIJO_CLIENTE : "/";
}

/**
 * Copia al response final las cookies que @supabase/ssr escribió al rotar el
 * token. Sin esto, cualquier rama que devuelva un response nuevo (redirect o
 * 401) pierde el token recién rotado: el navegador se queda con el refresh
 * token viejo, ya consumido, y la sesión se cae sola.
 */
function conCookies(origen: NextResponse, destino: NextResponse): NextResponse {
  for (const cookie of origen.cookies.getAll()) {
    destino.cookies.set(cookie);
  }
  return destino;
}

export async function actualizarSesion(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: OPCIONES_COOKIE_SESION,
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          const anterior = response;
          response = NextResponse.next({ request });
          for (const cookie of anterior.cookies.getAll()) {
            response.cookies.set(cookie);
          }
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  // IMPORTANTE: getUser() (no getSession()) revalida el token contra
  // Supabase Auth en cada request — getSession() solo lee la cookie sin
  // verificarla server-side.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Tener un JWT válido de Supabase Auth NO basta: el acceso a Kaudal lo da una
  // fila en public.usuarios, que solo crea el operador (docs/eng/03 §5.1). Un
  // auth.users sin esa fila (auto-registro, invitación a medias) queda fuera.
  // El JWT se puede fabricar contra Supabase directamente y pegarlo como cookie,
  // así que esta comprobación tiene que estar acá y no solo en /api/auth/login.
  // Deuda: es una query extra por request; si pesa, cachear por user.id con TTL corto.
  let rol: "operador" | "cliente" | null = null;
  if (user) {
    const { data: usuario } = await supabase
      .from("usuarios")
      .select("rol")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    rol = usuario?.rol ?? null;
  }
  const habilitado = rol !== null;

  if (!habilitado && !esRutaPublica(request.nextUrl.pathname)) {
    // Rutas de API: 401 JSON. Un fetch() de un cliente no debe recibir un
    // redirect HTML — rompería el .json() de quien la llama (browser o no).
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return conCookies(
        response,
        NextResponse.json({ ok: false, error: "Necesitas iniciar sesión." }, { status: 401 })
      );
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return conCookies(response, NextResponse.redirect(loginUrl));
  }

  if (habilitado && request.nextUrl.pathname === "/login") {
    return conCookies(response, NextResponse.redirect(new URL(inicioParaRol(rol!), request.url)));
  }

  // Tarea 3.2: el cliente queda confinado a /portal; el operador no entra a
  // /portal (es la vista del cliente, no una pantalla de soporte todavía —
  // si más adelante el operador necesita "ver como cliente X", eso es una
  // feature explícita con su propio registro de auditoría, no acceso directo
  // a esta ruta). Rutas de API y las públicas (ej. /invitacion, recién
  // confirmada) quedan fuera de esta partición.
  if (habilitado && !request.nextUrl.pathname.startsWith("/api/") && !esRutaPublica(request.nextUrl.pathname)) {
    const esDeCliente = esRutaDeCliente(request.nextUrl.pathname);
    if (rol === "cliente" && !esDeCliente) {
      return conCookies(response, NextResponse.redirect(new URL(PREFIJO_CLIENTE, request.url)));
    }
    if (rol === "operador" && esDeCliente) {
      return conCookies(response, NextResponse.redirect(new URL("/", request.url)));
    }
  }

  return response;
}
