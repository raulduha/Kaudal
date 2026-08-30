import { describe, expect, it } from "vitest";
import { calcularIvaClp, firmaWebhookValida, firmarWebhookSandbox } from "../src/lib/cobros/sandbox";

describe("cobros sandbox", () => {
  it("firma y valida un webhook sin aceptar una firma alterada", () => {
    const firma = firmarWebhookSandbox("token-de-prueba", "secreto");
    expect(firmaWebhookValida("token-de-prueba", firma, "secreto")).toBe(true);
    expect(firmaWebhookValida("token-de-prueba", `${firma.slice(0, -1)}0`, "secreto")).toBe(false);
  });

  it("calcula IVA chileno y redondea a pesos enteros", () => {
    expect(calcularIvaClp(1000)).toEqual({ neto: 1000, iva: 190, total: 1190 });
    expect(calcularIvaClp(101)).toEqual({ neto: 101, iva: 19, total: 120 });
  });
});
