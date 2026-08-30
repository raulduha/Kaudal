import { NextRequest } from "next/server";
import { z } from "zod";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { crearClienteServidor } from "@/lib/supabase/server";

const Params = z.object({ id: z.string().uuid() });

/**
 * Desconectar la API key (compliance-cl, tarea 5.1): la RPC
 * `revocar_api_key_cliente` ya existía desde la migración de 5.1 pero nada la
 * llamaba — el cliente solo podía "reemplazar" (rotar), nunca desconectar sin
 * poner otra key en su lugar.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const usuario = await obtenerUsuarioActual();
  if (!usuario || usuario.rol !== "cliente") {
    return Response.json({ ok: false, error: "No tienes permiso para hacer esto." }, { status: 403 });
  }

  const parsed = Params.safeParse(await params);
  if (!parsed.success) {
    return Response.json({ ok: false, error: "No encontramos esa API key." }, { status: 404 });
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("revocar_api_key_cliente", { p_id: parsed.data.id });

  if (error) {
    // Cupo por cliente (app.exigir_cupo_api_keys) — ver la nota en
    // ../route.ts. El resto de errores del RPC son genéricos a propósito
    // (no filtran si la key existe o es de otro cliente).
    if (error.code === "PT429") {
      return Response.json({ ok: false, error: error.message }, { status: 429 });
    }
    return Response.json({ ok: false, error: "No encontramos esa API key." }, { status: 404 });
  }

  return Response.json({ ok: true });
}
