import { createHmac, timingSafeEqual } from "node:crypto";

export type EstadoFlowSandbox = "pendiente" | "pagado" | "rechazado" | "anulado";

export function firmarWebhookSandbox(token: string, secreto: string): string {
  return createHmac("sha256", secreto).update(token).digest("hex");
}

export function firmaWebhookValida(token: string, firma: string, secreto: string): boolean {
  const esperada = Buffer.from(firmarWebhookSandbox(token, secreto), "hex");
  const recibida = Buffer.from(firma, "hex");
  return esperada.length === recibida.length && timingSafeEqual(esperada, recibida);
}

export function calcularIvaClp(neto: number) {
  const iva = Math.round(neto * 0.19);
  return { neto, iva, total: neto + iva };
}
