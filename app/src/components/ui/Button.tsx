import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const base =
  "inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-colors " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 " +
  "focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-50";

const variants: Record<ButtonVariant, string> = {
  // bg-primary (#7C5CFF) con texto blanco da ~4.34:1, bajo el 4.5:1 de AA para texto normal —
  // se usa bg-primary-hover (#6A4AF0, ~5.45:1) como base y se oscurece más al hover.
  primary: "bg-primary-hover text-white hover:brightness-90",
  secondary: "bg-surface-alt text-text border border-border hover:border-primary",
  ghost: "bg-transparent text-text-muted hover:bg-surface-alt hover:text-text",
  // bg-danger (#FF5C7A) con texto blanco da ~2.97:1; con texto oscuro (bg) da ~6.6:1.
  danger: "bg-danger text-bg hover:brightness-90",
};

// min-h-11 (44px) para cumplir el tamaño de toque mínimo de docs/07-ux-y-diseno.md §5.
// "sm" (36px) queda bajo ese mínimo: úsalo solo en contextos densos de escritorio
// (filas de tabla, toolbars) donde no es la única acción disponible, nunca como
// única acción táctil en móvil/portal cliente.
const sizes: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-sm",
  md: "min-h-11 px-5 text-sm",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", className, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    />
  );
});
