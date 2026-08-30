"use client";

import { useRef, useState } from "react";
import { Button, useToast } from "@/components/ui";

const MAX_ADJUNTOS = 5;
const EXTENSIONES_PERMITIDAS = "png, jpg, pdf, csv, txt, log, json";

// Extraído de NuevoTicketForm (9.1) para reusarlo también en la respuesta del
// hilo (9.1/9.2) sin duplicar la lógica de drag&drop + lista + quitar.
export function SelectorArchivos({ archivos, onArchivosChange }: { archivos: File[]; onArchivosChange: (a: File[]) => void }) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [arrastrando, setArrastrando] = useState(false);

  function agregar(nuevos: FileList | File[]) {
    const combinados = [...archivos, ...Array.from(nuevos)];
    if (combinados.length > MAX_ADJUNTOS) {
      toast({ variant: "warning", title: "Máximo 5 archivos", description: "Solo se agregaron los primeros 5." });
    }
    onArchivosChange(combinados.slice(0, MAX_ADJUNTOS));
  }

  function quitar(indice: number) {
    onArchivosChange(archivos.filter((_, i) => i !== indice));
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastrando(false);
          if (e.dataTransfer.files.length) agregar(e.dataTransfer.files);
        }}
        className={`rounded-md border border-dashed p-4 text-center text-sm transition-colors ${
          arrastrando ? "border-primary bg-primary/5" : "border-border"
        }`}
      >
        <p className="text-text-muted">Arrastra tus archivos acá, o</p>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="mt-2"
          onClick={() => inputRef.current?.click()}
          disabled={archivos.length >= MAX_ADJUNTOS}
        >
          Elegir archivos
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="sr-only"
          onChange={(e) => {
            if (e.target.files?.length) agregar(e.target.files);
            e.target.value = "";
          }}
        />
        <p className="mt-2 text-xs text-text-faint">Hasta {MAX_ADJUNTOS}, máx. 10 MB c/u ({EXTENSIONES_PERMITIDAS})</p>
      </div>

      {archivos.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5">
          {archivos.map((archivo, i) => (
            <li key={`${archivo.name}-${i}`} className="flex items-center justify-between gap-2 rounded-md bg-surface-alt px-3 py-2 text-xs text-text">
              <span className="truncate">{archivo.name}</span>
              <button
                type="button"
                onClick={() => quitar(i)}
                className="shrink-0 rounded p-1 text-text-muted hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label={`Quitar ${archivo.name}`}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
