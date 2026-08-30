import { randomBytes, createCipheriv, createDecipheriv, createHash } from "crypto";
import { claveMaestraActual, claveMaestraPorVersion } from "./master-key";

const ALGORITMO = "aes-256-gcm";

export interface BlobCifrado {
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
  version: number;
}

/**
 * Cifra la API key en memoria. `plaintext` NUNCA debe loguearse ni pasar por
 * ningún interceptor de logging — quien llame a esta función es responsable
 * de eso (docs/eng/03 §5.3, lista de campos a redactar).
 */
export function cifrarApiKey(plaintext: string): BlobCifrado {
  const { version, key } = claveMaestraActual();
  const iv = randomBytes(12); // nonce único por cifrado — nunca reutilizar con GCM.
  const cipher = createCipheriv(ALGORITMO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { ciphertext, iv, authTag, version };
}

/** Descifra. Lanza si el auth tag no valida (ciphertext manipulado o clave equivocada). */
export function descifrarApiKey(blob: BlobCifrado): string {
  const key = claveMaestraPorVersion(blob.version);
  const decipher = createDecipheriv(ALGORITMO, key, blob.iv);
  decipher.setAuthTag(blob.authTag);
  return decipher.update(blob.ciphertext).toString("utf8") + decipher.final("utf8");
}

/** Últimos 4 caracteres, para mostrar como hint sin exponer nada más. */
export function ultimos4(key: string): string {
  return key.trim().slice(-4);
}

/**
 * Huella no reversible de la key (SHA-256). Sirve para detectar "es la misma
 * key de antes" sin descifrar nada — nunca para reconstruir la key.
 */
export function huellaApiKey(key: string): string {
  return createHash("sha256").update(key.trim()).digest("hex");
}
