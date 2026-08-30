import { crearClienteServidor } from "@/lib/supabase/server";

export interface UsuarioActual {
  id: string;
  orgId: string;
  clienteId: string | null;
  rol: "operador" | "cliente";
  nombre: string | null;
  email: string;
}

/**
 * Para Server Components/Route Handlers: el usuario de Kaudal de la sesión
 * actual (no solo el `auth.users` de Supabase — ver docs/eng/03 §5.1, "el
 * cliente no se auto-registra": tener sesión de Supabase Auth no basta, hace
 * falta la fila en `public.usuarios` que solo crea el operador). Devuelve
 * `null` si no hay sesión o la cuenta no tiene acceso a Kaudal; el
 * middleware (`src/lib/supabase/middleware.ts`) ya redirige/bloquea antes de
 * llegar acá, así que en la práctica esto no debería devolver `null` en una
 * ruta protegida — pero cada página lo revisa igual (defensa en profundidad).
 */
export async function obtenerUsuarioActual(): Promise<UsuarioActual | null> {
  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("usuarios")
    .select("id, org_id, cliente_id, rol, nombre, email")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!data) return null;

  return {
    id: data.id,
    orgId: data.org_id,
    clienteId: data.cliente_id,
    rol: data.rol,
    nombre: data.nombre,
    email: data.email,
  };
}
