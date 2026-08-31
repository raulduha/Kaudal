import { ReactNode } from "react";

/** Ayuda contextual expandible: explica sin cargar la pantalla de texto. */
export function InfoAyuda({ titulo = "Más información", children }: { titulo?: string; children: ReactNode }) {
  return <details className="group relative inline-block align-middle">
    <summary aria-label={titulo} className="ml-1 inline-flex h-5 w-5 cursor-pointer list-none items-center justify-center rounded-full border border-info/50 text-xs font-bold text-info hover:bg-info/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
      <span aria-hidden="true">i</span><span className="sr-only">{titulo}</span>
    </summary>
    <div role="note" className="absolute left-0 top-7 z-20 w-80 rounded-lg border border-info/30 bg-surface p-3 text-sm leading-5 text-text shadow-xl">
      {children}
    </div>
  </details>;
}
