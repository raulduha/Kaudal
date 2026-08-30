/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  experimental: {
    // Descubierto verificando en vivo el fix de MEDIO-2 (tarea 9.1): Next.js
    // trunca en SILENCIO el body de cualquier request que pase por
    // `middleware.ts` (todas las rutas de este proyecto, salvo las públicas)
    // a 10 MB por defecto — antes de que `req.formData()` corra en el Route
    // Handler. Con eso por debajo de nuestro tope real (5 adjuntos × 10 MB,
    // `MAX_CUERPO_BYTES` en las rutas de /api/portal/tickets), un archivo
    // legítimo de más de 10 MB llegaba truncado y `formData()` fallaba con un
    // error de parseo confuso en vez del 413 claro que ya construimos. Se
    // sube el techo de Next por encima de `MAX_CUERPO_BYTES` para que sea
    // SIEMPRE nuestro propio guard (con su mensaje en español) el que
    // rechaza, nunca este truncado silencioso.
    middlewareClientMaxBodySize: "60mb",
  },
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        { key: "Content-Security-Policy", value: "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; object-src 'none'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self' https://*.supabase.co wss://*.supabase.co;" },
      ],
    }];
  },
};
export default nextConfig;
