export function estadoInstanciaTrasPago(estadoPago: "pagado" | "rechazado" | "anulado") {
  return estadoPago === "pagado" ? "activa" : "suspendida" as const;
}

export function calcularRentabilidadInstancia(mantencionClp: number, costoInstanciaClp: number, margenPct: number) {
  const minimo = Math.ceil(costoInstanciaClp * (1 + margenPct / 100));
  return { minimo, margenReal: mantencionClp - costoInstanciaClp, cubre: mantencionClp >= minimo };
}
