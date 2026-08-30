"use client";

import { ChangeEvent, FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { Button, Input, InfoNote, useToast } from "@/components/ui";
import { validarRut } from "@/lib/chile/rut";

interface FormState {
  razonSocial: string;
  nombreFantasia: string;
  rut: string;
  giro: string;
  emailContacto: string;
  nombreContacto: string;
  plan: string;
}

const inicial: FormState = {
  razonSocial: "",
  nombreFantasia: "",
  rut: "",
  giro: "",
  emailContacto: "",
  nombreContacto: "",
  plan: "",
};

export default function InscribirClientePage() {
  const router = useRouter();
  const { toast } = useToast();
  const [form, setForm] = useState<FormState>(inicial);
  const [errores, setErrores] = useState<Partial<Record<keyof FormState, string>>>({});
  const [enviando, setEnviando] = useState(false);

  function campo<K extends keyof FormState>(key: K) {
    return {
      value: form[key],
      onChange: (e: ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value })),
    };
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErrores({});

    if (form.rut && !validarRut(form.rut)) {
      setErrores({ rut: "RUT inválido. Formato 12.345.678-9." });
      return;
    }

    setEnviando(true);
    try {
      const res = await fetch("/api/clientes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast({ variant: "danger", title: "No pudimos inscribir al cliente", description: data.error });
        return;
      }
      toast({
        variant: "success",
        title: "Listo",
        description: `Inscribiste a ${data.cliente.razonSocial}. Le llegó la invitación a ${data.cliente.email}.`,
      });
      router.push("/clientes");
      router.refresh();
    } catch {
      toast({ variant: "danger", title: "No pudimos conectar", description: "Revisa tu conexión e intenta de nuevo." });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <AppShell rol="operador" activeId="clientes">
      <h1 className="text-2xl font-bold text-text">Inscribir cliente</h1>
      <p className="mt-1 text-text-muted">
        Tú creas la cuenta. El cliente después entra y pone su propia API key.
      </p>

      <form onSubmit={onSubmit} noValidate className="mt-6 max-w-2xl space-y-4 rounded-xl border border-border bg-surface p-6">
        <Input label="Razón social" required {...campo("razonSocial")} />
        <Input label="Nombre de fantasía" helperText="Se muestra en el portal del cliente." {...campo("nombreFantasia")} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="RUT"
            required
            placeholder="12.345.678-9"
            helperText="Formato 12.345.678-9. Lo validamos al tiro."
            error={errores.rut}
            {...campo("rut")}
          />
          <Input label="Giro" helperText="Para la boleta o factura." {...campo("giro")} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Nombre del contacto" required helperText="La persona que va a administrar la cuenta." {...campo("nombreContacto")} />
          <Input label="Correo del contacto" type="email" required helperText="Ahí le llega la invitación." {...campo("emailContacto")} />
        </div>
        <Input label="Plan" helperText="Opcional — lo puedes ajustar después." {...campo("plan")} />

        <InfoNote>
          Tú no ingresas la API key del cliente. Él la pone en su portal y queda cifrada. Nunca la vas a ver en
          texto plano.
        </InfoNote>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={() => router.push("/clientes")}>
            Cancelar
          </Button>
          <Button type="submit" disabled={enviando}>
            {enviando ? "Inscribiendo…" : "Inscribir cliente"}
          </Button>
        </div>
      </form>
    </AppShell>
  );
}
