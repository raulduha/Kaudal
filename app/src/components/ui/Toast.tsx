"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";

export type ToastVariant = "info" | "success" | "warning" | "danger";

interface ToastItem {
  id: number;
  variant: ToastVariant;
  title: string;
  description?: string;
}

type ToastInput = Omit<ToastItem, "id">;

interface ToastContextValue {
  toast: (input: ToastInput) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const variantStyles: Record<ToastVariant, string> = {
  info: "border-info/30 bg-surface text-text",
  success: "border-secondary/30 bg-surface text-text",
  // Naranjo "requiere atención" (docs/eng/05 §2), no el ámbar de statusColors.updated.
  warning: "border-accent-warm/30 bg-surface text-text",
  danger: "border-danger/30 bg-surface text-text",
};

const variantDot: Record<ToastVariant, string> = {
  info: "bg-info",
  success: "bg-secondary",
  warning: "bg-accent-warm",
  danger: "bg-danger",
};

const DURATION_MS = 5000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  // Los toasts de error (danger) no se auto-cierran: el usuario los cierra a mano
  // para no perder un mensaje crítico (WCAG 2.2.1 Timing Adjustable).
  const scheduleDismiss = useCallback(
    (id: number, variant: ToastVariant) => {
      if (variant === "danger") return;
      const t = setTimeout(() => dismiss(id), DURATION_MS);
      timers.current.set(id, t);
    },
    [dismiss]
  );

  const pause = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
  }, []);

  const resume = useCallback(
    (id: number, variant: ToastVariant) => {
      scheduleDismiss(id, variant);
    },
    [scheduleDismiss]
  );

  const toast = useCallback(
    (input: ToastInput) => {
      const id = nextId.current++;
      setItems((prev) => [...prev, { id, ...input }]);
      scheduleDismiss(id, input.variant);
    },
    [scheduleDismiss]
  );

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2">
        {items.map((item) => (
          <div
            key={item.id}
            role={item.variant === "danger" ? "alert" : "status"}
            aria-live={item.variant === "danger" ? "assertive" : "polite"}
            onMouseEnter={() => pause(item.id)}
            onMouseLeave={() => resume(item.id, item.variant)}
            onFocus={() => pause(item.id)}
            onBlur={() => resume(item.id, item.variant)}
            className={cn(
              "pointer-events-auto flex items-start gap-3 rounded-lg border p-4 shadow-lg",
              variantStyles[item.variant]
            )}
          >
            <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", variantDot[item.variant])} aria-hidden="true" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-text">{item.title}</p>
              {item.description && <p className="mt-0.5 text-xs text-text-muted">{item.description}</p>}
            </div>
            <button
              type="button"
              onClick={() => dismiss(item.id)}
              aria-label="Cerrar notificación"
              className="-m-2.5 flex h-11 w-11 shrink-0 items-center justify-center rounded text-text-faint hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast debe usarse dentro de <ToastProvider>");
  return ctx;
}
