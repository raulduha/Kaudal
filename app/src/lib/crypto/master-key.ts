/**
 * Clave(s) maestra(s) de cifrado de API keys de clientes (docs/eng/03 §2.3).
 * Nunca en el repo ni en el frontend — solo variables de entorno del backend.
 *
 * Formato en env: `KAUDAL_MASTER_KEY_V<n>` = 32 bytes en base64. Soporta más
 * de una versión a la vez a propósito (docs/eng/03 §2.4, rotación): las keys
 * nuevas se cifran con `KAUDAL_KEY_VERSION_ACTUAL`, pero se puede seguir
 * descifrando blobs viejos mientras exista la variable de su versión.
 */

function leerClavePorVersion(version: number): Buffer {
  // La versión se interpola en el nombre de la variable de entorno y, al
  // descifrar, viene de la BD (`api_keys_cifradas.key_version`). No hay
  // inyección posible (es un lookup en process.env, no un eval), pero un valor
  // no entero produciría `KAUDAL_MASTER_KEY_VNaN` y un error confuso: se
  // rechaza acá, explícito y cerrado.
  if (!Number.isInteger(version) || version < 1) {
    throw new Error("Versión de clave maestra inválida (debe ser un entero >= 1).");
  }
  const variable = `KAUDAL_MASTER_KEY_V${version}`;
  const b64 = process.env[variable];
  if (!b64) {
    throw new Error(`Falta ${variable} en el entorno (clave maestra de cifrado).`);
  }
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) {
    throw new Error(`${variable} debe decodificar a 32 bytes (AES-256). Hoy tiene ${key.length}.`);
  }
  return key;
}

export function versionClaveActual(): number {
  return Number(process.env.KAUDAL_KEY_VERSION_ACTUAL ?? "1");
}

export function claveMaestraActual(): { version: number; key: Buffer } {
  const version = versionClaveActual();
  return { version, key: leerClavePorVersion(version) };
}

export function claveMaestraPorVersion(version: number): Buffer {
  return leerClavePorVersion(version);
}
