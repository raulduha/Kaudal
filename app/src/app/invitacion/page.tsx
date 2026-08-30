import { crearClienteServidor } from "@/lib/supabase/server";
import { brand } from "@brand/brand.config";
import { FormularioClave } from "./FormularioClave";

// Home del flujo de invitación (tarea 4.2). La sesión ya quedó establecida
// server-side por /auth/confirmar (verifyOtp + cookie HttpOnly) antes de
// llegar acá — esta página nunca procesa tokens ni corre lógica de sesión,
// solo decide qué mostrar según si esa sesión existe.
export default async function InvitacionPage() {
  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-lg font-bold text-white">
            {brand.name.slice(0, 1)}
          </div>
          <h1 className="text-xl font-semibold text-text">Te inscribieron en {brand.name}</h1>
          <p className="mt-1 text-sm text-text-muted">Elige tu contraseña para entrar por primera vez.</p>
        </div>

        <div className="rounded-xl border border-border bg-surface p-6">
          {user ? (
            <FormularioClave />
          ) : (
            <div className="space-y-3 text-sm">
              <p className="text-text">Este link no es válido o ya expiró.</p>
              <p className="text-text-muted">
                Pídele a quien te inscribió en {brand.name} que te envíe una invitación nueva.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
