import { type NextRequest } from "next/server";
import { actualizarSesion } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return actualizarSesion(request);
}

export const config = {
  matcher: [
    /*
     * Corre en todo menos: assets estáticos de Next, favicon, y /design
     * (galería de componentes de desarrollo — deuda ya anotada en TASKS.md
     * 1.1/1.3: ocultar /design antes de producción; mientras tanto queda
     * fuera del gate de auth para no trabar el flujo de diseño).
     */
    "/((?!_next/static|_next/image|favicon.ico|design).*)",
  ],
};
