import { redirect } from "next/navigation";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { AppShell } from "@/components/layout/AppShell";
import { DocsContent } from "./DocsContent";

export default async function DocsPage() {
  const usuario = await obtenerUsuarioActual();
  if (!usuario || usuario.rol !== "operador") redirect("/login");

  return <AppShell rol="operador" activeId="docs" nombrePerfil={usuario.nombre ?? usuario.email}><DocsContent /></AppShell>;
}
