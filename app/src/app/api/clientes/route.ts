import { NextRequest } from "next/server";
import { z } from "zod";
import { crearClienteServidor } from "@/lib/supabase/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { limpiarRut, validarRut } from "@/lib/chile/rut";

const Body = z.object({
  razonSocial: z.string().trim().min(1, "Falta la razón social.").max(200),
  nombreFantasia: z.string().trim().max(200).optional().or(z.literal("")),
  rut: z
    .string()
    .trim()
    .min(1, "Falta el RUT.")
    .refine((v) => validarRut(v), "RUT inválido. Formato 12.345.678-9."),
  giro: z.string().trim().max(200).optional().or(z.literal("")),
  emailContacto: z.string().trim().email("Correo inválido."),
  nombreContacto: z.string().trim().min(1, "Falta el nombre del contacto.").max(200),
  plan: z.string().trim().max(60).optional().or(z.literal("")),
});

// En producción, definir NEXT_PUBLIC_SITE_URL con el dominio real (y agregarlo
// a additional_redirect_urls en la config de Auth, o el invite queda rechazado).
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export async function POST(req: NextRequest) {
  // Autorización real: la da RLS (las políticas *_operador exigen
  // app.current_rol() = 'operador') sobre el cliente de sesión de abajo, no
  // este chequeo — pero fallar temprano con un 403 claro evita gastar una
  // llamada a la Admin API de Auth si el rol ya está mal.
  const usuario = await obtenerUsuarioActual();
  if (!usuario || usuario.rol !== "operador") {
    return Response.json({ ok: false, error: "No tienes permiso para inscribir clientes." }, { status: 403 });
  }

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." },
      { status: 400 }
    );
  }
  const datos = parsed.data;
  const rut = limpiarRut(datos.rut);

  // RLS (clientes_operador) es quien realmente exige org_id/rol=operador;
  // este cliente respeta esa política porque usa la sesión del usuario, no
  // el service_role.
  const supabase = await crearClienteServidor();

  const { data: existente } = await supabase
    .from("clientes")
    .select("id")
    .eq("org_id", usuario.orgId)
    .eq("rut", rut)
    .is("deleted_at", null)
    .maybeSingle();
  if (existente) {
    return Response.json({ ok: false, error: "Ya existe un cliente inscrito con ese RUT." }, { status: 409 });
  }

  const { data: clienteCreado, error: errorCliente } = await supabase
    .from("clientes")
    .insert({
      org_id: usuario.orgId,
      razon_social: datos.razonSocial,
      nombre_fantasia: datos.nombreFantasia || null,
      rut,
      giro: datos.giro || null,
      email: datos.emailContacto,
      plan_default: datos.plan || null,
    })
    .select("id, razon_social")
    .single();

  if (errorCliente || !clienteCreado) {
    const duplicado = errorCliente?.code === "23505";
    return Response.json(
      { ok: false, error: duplicado ? "Ya existe un cliente inscrito con ese RUT." : "No pudimos crear el cliente." },
      { status: duplicado ? 409 : 500 }
    );
  }

  // Deshacer el `clientes` recién creado si algo de acá en adelante falla —
  // no hay transacción distribuida entre Postgres y la Admin API de Auth. Si el
  // propio rollback falla (red, RLS, etc.) no hay como reintentar de forma
  // automática: dejamos rastro con console.error (no hay logging estructurado
  // todavía) para poder limpiar el `clientes` huérfano a mano.
  const clienteId = clienteCreado.id;
  async function deshacerCliente() {
    const { error } = await supabase.from("clientes").delete().eq("id", clienteId);
    if (error) {
      console.error("[POST /api/clientes] no se pudo deshacer el cliente huérfano", {
        clienteId,
        error,
      });
    }
  }

  const admin = crearClienteAdmin();
  const { data: invitado, error: errorInvite } = await admin.auth.admin.inviteUserByEmail(
    datos.emailContacto,
    { redirectTo: `${SITE_URL}/invitacion` }
  );

  if (errorInvite || !invitado.user) {
    await deshacerCliente();
    const yaRegistrado = errorInvite?.code === "email_exists" || errorInvite?.status === 422;
    return Response.json(
      {
        ok: false,
        error: yaRegistrado
          ? "Ese correo ya tiene una cuenta en Kaudal."
          : "No pudimos enviar la invitación. Intenta de nuevo.",
      },
      { status: yaRegistrado ? 409 : 502 }
    );
  }

  const { error: errorUsuario } = await supabase.from("usuarios").insert({
    org_id: usuario.orgId,
    cliente_id: clienteId,
    auth_user_id: invitado.user.id,
    rol: "cliente",
    nombre: datos.nombreContacto,
    email: datos.emailContacto,
  });

  if (errorUsuario) {
    await deshacerCliente();
    const { error: errorDeleteUser } = await admin.auth.admin
      .deleteUser(invitado.user.id)
      .catch((err: unknown) => ({ data: null, error: err }));
    if (errorDeleteUser) {
      console.error("[POST /api/clientes] no se pudo revertir la invitación en auth.users", {
        authUserId: invitado.user.id,
        error: errorDeleteUser,
      });
    }
    return Response.json({ ok: false, error: "No pudimos crear el cliente." }, { status: 500 });
  }

  return Response.json({
    ok: true,
    cliente: { id: clienteCreado.id, razonSocial: clienteCreado.razon_social, email: datos.emailContacto },
  });
}
