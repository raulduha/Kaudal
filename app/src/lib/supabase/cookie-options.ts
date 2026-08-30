import type { CookieOptionsWithName } from "@supabase/ssr";

/**
 * docs/eng/03 §5.3: refresh token rotativo en cookie HttpOnly + Secure +
 * SameSite=Strict. @supabase/ssr NO pone estos flags por default (su default
 * es pensado también para el cliente de navegador) — hay que pedirlos.
 *
 * `secure` queda condicionado a producción: en `http://localhost` (dev) los
 * navegadores descartan cookies `Secure` y el login dejaría de funcionar
 * localmente. En cualquier deploy real (Railway u on-premise) corre detrás
 * de HTTPS, así que `NODE_ENV === 'production'` sí implica TLS.
 */
export const OPCIONES_COOKIE_SESION: CookieOptionsWithName = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict",
  path: "/",
};
