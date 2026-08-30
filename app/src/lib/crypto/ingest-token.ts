import { randomBytes, createHash } from "crypto";

/**
 * Token que el agente usa para reportar uso (docs/eng/01 §4.2: metodo_reporte
 * = 'reportado'). Se muestra al operador UNA sola vez al registrar el agente;
 * en la base solo se guarda el hash (`agentes.ingest_token_hash`), igual que
 * una contraseña — no es reversible, no se puede "volver a mostrar".
 */
export function generarIngestToken(): { token: string; hash: string } {
  const token = `kdl_${randomBytes(24).toString("hex")}`;
  const hash = createHash("sha256").update(token).digest("hex");
  return { token, hash };
}
