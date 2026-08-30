"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Marca como leídos los mensajes de este ticket al abrir el hilo. Va en un
// client component con efecto en vez de dentro del Server Component de la
// página: marcar-como-leído es una escritura, y un Server Component puede
// re-ejecutarse en un prefetch o una recarga sin que el usuario haya "visto"
// nada de verdad — el efecto solo corre en el navegador, tras el montaje real.
export function MarcarLeido({ ticketId }: { ticketId: string }) {
  const router = useRouter();

  useEffect(() => {
    let cancelado = false;
    fetch(`/api/portal/tickets/${ticketId}/leer`, { method: "POST" })
      .then((res) => res.json())
      .then((data) => {
        // Si de verdad marcó algo, refresca para que el badge del nav baje.
        if (!cancelado && data?.ok && data.marcados > 0) router.refresh();
      })
      .catch(() => {});
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId]);

  return null;
}
