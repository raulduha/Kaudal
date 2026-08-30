const formatoFecha = new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "short" });

/** "Hace 12 min" / "Hace 3 h" / "Hace 2 d" / fecha corta si ya pasó más de un mes. */
export function formatoTiempoRelativo(iso: string, ahora: Date = new Date()): string {
  const ms = ahora.getTime() - new Date(iso).getTime();
  const minutos = Math.max(0, Math.round(ms / 60_000));

  if (minutos < 1) return "Hace un momento";
  if (minutos < 60) return `Hace ${minutos} min`;

  const horas = Math.round(minutos / 60);
  if (horas < 24) return `Hace ${horas} h`;

  const dias = Math.round(horas / 24);
  if (dias < 30) return `Hace ${dias} d`;

  return formatoFecha.format(new Date(iso));
}
