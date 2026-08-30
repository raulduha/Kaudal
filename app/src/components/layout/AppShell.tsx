"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import { brand } from "@brand/brand.config";
import { Rol } from "@/components/ui/Badge";
import { EstadoConexion } from "@/components/ui/ConnectionBadge";
import { Sidebar, NavItem } from "./Sidebar";
import { Topbar } from "./Topbar";
import { HomeIcon, UsersIcon, BotIcon, ChartIcon, CreditCardIcon, ChatIcon, SettingsIcon, CalculatorIcon } from "./icons";

// Navegación del operador — docs/eng/05-frontend-operador.md §3.
const NAV_OPERADOR: Omit<NavItem, "badgeCount">[] = [
  { id: "dashboard", label: "Dashboard", href: "/", icon: HomeIcon },
  { id: "clientes", label: "Clientes", href: "/clientes", icon: UsersIcon },
  { id: "agentes", label: "Agentes", href: "/agentes", icon: BotIcon },
  { id: "uso", label: "Uso", href: "/uso", icon: ChartIcon },
  // Simulador de precio (tarea 7.2) — distinto de "Uso" (datos reales
  // agregados, 7.3): acá el operador prueba "¿cuánto cobro?" antes de vender.
  { id: "calculadora", label: "Calculadora", href: "/calculadora", icon: CalculatorIcon },
  { id: "cobros", label: "Cobros", href: "/cobros", icon: CreditCardIcon },
  { id: "instancias", label: "Instancias", href: "/instancias", icon: BotIcon },
  { id: "reclamos", label: "Reclamos", href: "/reclamos", icon: ChatIcon },
  { id: "ajustes", label: "Ajustes", href: "/ajustes", icon: SettingsIcon },
];

// Navegación del cliente — docs/eng/06-portal-cliente.md §2.
const NAV_CLIENTE: Omit<NavItem, "badgeCount">[] = [
  { id: "inicio", label: "Inicio", href: "/portal", icon: HomeIcon },
  { id: "mis-agentes", label: "Mis agentes", href: "/portal/agentes", icon: BotIcon },
  { id: "uso-costo", label: "Uso y costo", href: "/portal/uso", icon: ChartIcon },
  { id: "cobros", label: "Estado de cuenta", href: "/portal/cobros", icon: CreditCardIcon },
  { id: "dudas-reclamos", label: "Dudas y reclamos", href: "/portal/reclamos", icon: ChatIcon },
  { id: "mi-cuenta", label: "Mi cuenta", href: "/portal/cuenta", icon: SettingsIcon },
];

function BrandMark() {
  return (
    <div className="flex items-center gap-2 px-4 py-4">
      <span
        aria-hidden="true"
        className="h-5 w-5 rounded-[40%] bg-gradient-to-br from-primary to-secondary"
        style={{ transform: "rotate(45deg)" }}
      />
      <span className="text-base font-extrabold tracking-tight">{brand.name}</span>
    </div>
  );
}

export interface AppShellProps {
  rol: Rol;
  activeId?: string;
  children: ReactNode;
  conexion?: EstadoConexion;
  /** Operador: nombre de quien tiene la sesión + conteo de reclamos abiertos (badge naranjo en el nav). */
  nombrePerfil?: string;
  reclamosAbiertos?: number;
  /** Cliente: nombre de la empresa + costo estimado del mes, siempre visibles en el topbar. */
  empresaNombre?: string;
  costoEstimadoClp?: number;
}

export function AppShell({
  rol,
  activeId,
  children,
  conexion,
  nombrePerfil,
  reclamosAbiertos,
  empresaNombre,
  costoEstimadoClp,
}: AppShellProps) {
  const items: NavItem[] = (rol === "operador" ? NAV_OPERADOR : NAV_CLIENTE).map((item) =>
    item.id === "reclamos" || item.id === "dudas-reclamos" ? { ...item, badgeCount: reclamosAbiertos } : item
  );

  const [menuAbierto, setMenuAbierto] = useState(false);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const menuCloseRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuAbierto) return;
    menuCloseRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") cerrarMenu();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuAbierto]);

  function cerrarMenu() {
    setMenuAbierto(false);
    menuTriggerRef.current?.focus();
  }

  return (
    <div className="flex min-h-screen bg-bg text-text">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-primary-hover focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Saltar al contenido
      </a>

      {/* Sidebar de escritorio */}
      <aside className="hidden w-60 shrink-0 border-r border-border bg-surface md:flex md:flex-col">
        <BrandMark />
        <Sidebar rol={rol} items={items} activeId={activeId} className="flex-1" />
      </aside>

      {/* Drawer de navegación mobile — bajo md el sidebar de arriba está oculto,
          esto evita dejar al operador/cliente sin forma de cambiar de pantalla
          en el celular (docs/07 §6, docs/eng/06 §11). */}
      {menuAbierto && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/50" aria-hidden="true" onClick={cerrarMenu} />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Menú de navegación"
            className="absolute inset-y-0 left-0 flex w-64 flex-col bg-surface"
          >
            <div className="flex items-center justify-between pr-2">
              <BrandMark />
              <button
                ref={menuCloseRef}
                type="button"
                onClick={cerrarMenu}
                aria-label="Cerrar menú de navegación"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-surface-alt hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" aria-hidden="true" className="h-5 w-5">
                  <path d="M5 5l10 10M15 5L5 15" />
                </svg>
              </button>
            </div>
            <Sidebar rol={rol} items={items} activeId={activeId} className="flex-1" />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          rol={rol}
          conexion={conexion}
          nombrePerfil={nombrePerfil}
          empresaNombre={empresaNombre}
          costoEstimadoClp={costoEstimadoClp}
          onOpenMenu={() => setMenuAbierto(true)}
          menuButtonRef={menuTriggerRef}
        />
        <main id="contenido" tabIndex={-1} className="flex-1 overflow-y-auto p-6 focus:outline-none">
          {children}
        </main>
      </div>
    </div>
  );
}
