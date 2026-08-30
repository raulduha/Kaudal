/**
 * FUENTE ÚNICA DE VERDAD DE LA MARCA
 * Cambia estos valores para renombrar el producto en toda la app.
 * No hardcodear "Kaudal" en componentes: importar desde aquí.
 */
export const brand = {
  name: "Kaudal",
  legalName: "Kaudal SpA",
  domain: "kaudal.cl",
  tagline: "El caudal de agentes que mueve tu empresa.",
  supportEmail: "hola@kaudal.cl",
  locale: "es-CL",
  currency: "CLP",
} as const;

/**
 * TOKENS DE COLOR — modo oscuro por defecto (el canvas de agentes vive en oscuro),
 * con equivalentes claros. Estilo "n8n pero más cool": lienzo profundo + acento eléctrico.
 */
export const colors = {
  // Lienzo / superficies (oscuro)
  bg: "#0B0B12",          // fondo casi negro con tinte índigo
  surface: "#14141F",     // tarjetas
  surfaceAlt: "#1C1C2B",  // tarjetas elevadas / hover
  border: "#2A2A3D",

  // Acentos
  primary: "#7C5CFF",     // violeta eléctrico (marca) — para fondos sólidos y puntos, NO como texto sobre oscuro (no alcanza 4.5:1)
  primaryHover: "#6A4AF0",
  primaryTextOnDark: "#9B85FF", // tinte de primary con contraste AA (~6:1) para usarlo como texto sobre bg/surface
  secondary: "#00E0B8",   // menta/cian (éxito, "en línea", flujos activos)
  accentWarm: "#FF7A45",  // naranjo (alertas suaves, guiño a la referencia)

  // Semánticos
  success: "#00E0B8",
  warning: "#FFC24B",
  danger: "#FF5C7A",
  info: "#5CC8FF",

  // Texto
  text: "#F4F4FB",
  textMuted: "#A7A7C0",
  textFaint: "#6E6E8A",
} as const;

/** Colores por estado de agente/nodo (usados en el canvas y tarjetas) */
export const statusColors = {
  idle:      { label: "En espera",   color: "#6E6E8A" },
  working:   { label: "Trabajando",  color: "#7C5CFF" },
  done:      { label: "Ha terminado", color: "#00E0B8" },
  waiting:   { label: "Ya trabajando", color: "#5CC8FF" },
  updated:   { label: "Actualizado", color: "#FFC24B" },
  error:     { label: "Con problema", color: "#FF5C7A" },
} as const;

export const typography = {
  sans: "'Geist', 'Inter', system-ui, sans-serif",
  mono: "'Geist Mono', 'JetBrains Mono', monospace",
  display: "'Geist', 'Inter', sans-serif",
} as const;

export const radii = { sm: "8px", md: "12px", lg: "16px", xl: "24px", pill: "999px" } as const;
