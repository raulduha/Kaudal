/** Utilidades de RUT chileno (docs/eng/05 §7: "validador RUT-CL, módulo 11"). */

/** Quita puntos/espacios y deja el dígito verificador en mayúscula. */
export function limpiarRut(rut: string): string {
  return rut.replace(/[.\s-]/g, "").toUpperCase();
}

/** "123456789" -> "12.345.678-9" (o "-K"). Asume que ya viene limpio y válido en forma. */
export function formatearRut(rut: string): string {
  const limpio = limpiarRut(rut);
  const cuerpo = limpio.slice(0, -1);
  const dv = limpio.slice(-1);
  const conPuntos = cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${conPuntos}-${dv}`;
}

/** Dígito verificador módulo 11 sobre el cuerpo (sin DV) del RUT. */
function calcularDv(cuerpo: string): string {
  let suma = 0;
  let multiplicador = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * multiplicador;
    multiplicador = multiplicador === 7 ? 2 : multiplicador + 1;
  }
  const resto = 11 - (suma % 11);
  if (resto === 11) return "0";
  if (resto === 10) return "K";
  return String(resto);
}

/** true si el formato y el dígito verificador (módulo 11) son válidos. */
export function validarRut(rut: string): boolean {
  const limpio = limpiarRut(rut);
  if (!/^\d{7,8}[0-9K]$/.test(limpio)) return false;
  const cuerpo = limpio.slice(0, -1);
  const dv = limpio.slice(-1);
  return calcularDv(cuerpo) === dv;
}
