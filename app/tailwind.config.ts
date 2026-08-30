import type { Config } from "tailwindcss";
import { colors, typography, radii, statusColors } from "../brand/brand.config";

/**
 * Tokens tomados de brand/brand.config.ts (fuente única de verdad).
 * No dupliques valores de color acá: si cambia la marca, cambia allá.
 */
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bg: colors.bg,
        surface: colors.surface,
        "surface-alt": colors.surfaceAlt,
        border: colors.border,
        primary: { DEFAULT: colors.primary, hover: colors.primaryHover },
        "primary-text": colors.primaryTextOnDark,
        secondary: colors.secondary,
        "accent-warm": colors.accentWarm,
        success: colors.success,
        warning: colors.warning,
        danger: colors.danger,
        info: colors.info,
        text: { DEFAULT: colors.text, muted: colors.textMuted, faint: colors.textFaint },
        status: {
          idle: statusColors.idle.color,
          working: statusColors.working.color,
          done: statusColors.done.color,
          waiting: statusColors.waiting.color,
          updated: statusColors.updated.color,
          error: statusColors.error.color,
        },
      },
      fontFamily: {
        // Geist se carga en app/src/app/layout.tsx con next/font/google y expone
        // --font-geist-sans/--font-geist-mono; el resto de la lista es el fallback
        // declarado en brand.config.ts si la variable no está disponible.
        sans: ["var(--font-geist-sans)", ...typography.sans.split(",").map((f) => f.trim())],
        mono: ["var(--font-geist-mono)", ...typography.mono.split(",").map((f) => f.trim())],
        display: ["var(--font-geist-sans)", ...typography.display.split(",").map((f) => f.trim())],
      },
      borderRadius: {
        sm: radii.sm,
        md: radii.md,
        lg: radii.lg,
        xl: radii.xl,
        pill: radii.pill,
      },
    },
  },
  plugins: [],
};

export default config;
