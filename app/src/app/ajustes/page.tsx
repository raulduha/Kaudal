import { redirect } from "next/navigation";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { AppShell } from "@/components/layout/AppShell";
import { CerrarSesionBoton } from "../portal/CerrarSesionBoton";

export default async function AjustesPage() {
  const usuario = await obtenerUsuarioActual();
  if (!usuario || usuario.rol !== "operador") redirect("/login");

  return <AppShell rol="operador" activeId="ajustes" nombrePerfil={usuario.nombre ?? usuario.email}>
    <h1 className="text-2xl font-bold text-text">Ajustes</h1>
    <p className="mt-1 text-text-muted">Tu cuenta y el estado del entorno de Kaudal.</p>
    <div className="mt-6 grid max-w-3xl gap-5">
      <section className="rounded-xl border border-border bg-surface p-5"><h2 className="text-lg font-semibold text-text">Tu cuenta</h2><dl className="mt-4 grid gap-4 sm:grid-cols-2"><div><dt className="text-sm text-text-muted">Nombre</dt><dd className="mt-1 font-medium text-text">{usuario.nombre ?? "Sin nombre"}</dd></div><div><dt className="text-sm text-text-muted">Correo</dt><dd className="mt-1 break-all font-medium text-text">{usuario.email}</dd></div><div><dt className="text-sm text-text-muted">Rol</dt><dd className="mt-1 font-medium text-secondary">Operador</dd></div></dl></section>
      <section className="rounded-xl border border-border bg-surface p-5"><h2 className="text-lg font-semibold text-text">Entorno</h2><p className="mt-2 text-sm leading-6 text-text-muted">Estás en desarrollo local. Cobros, DTE y despliegue de instancias funcionan solo en sandbox hasta conectar las credenciales de producción.</p></section>
      <section className="rounded-xl border border-border bg-surface p-5"><h2 className="text-lg font-semibold text-text">Sesión</h2><p className="mt-2 text-sm text-text-muted">Cierra la cuenta actual antes de entrar con otro usuario de prueba.</p><div className="mt-4"><CerrarSesionBoton /></div></section>
    </div>
  </AppShell>;
}
