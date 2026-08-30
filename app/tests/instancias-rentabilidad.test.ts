import { describe, expect, it } from "vitest";
import { calcularRentabilidadInstancia } from "../src/lib/instancias/suspension";
describe("rentabilidad de instancia", () => {
  it("exige costo más margen configurado", () => {
    expect(calcularRentabilidadInstancia(12000, 10000, 20)).toMatchObject({ minimo: 12000, margenReal: 2000, cubre: true });
    expect(calcularRentabilidadInstancia(11999, 10000, 20).cubre).toBe(false);
  });
});
