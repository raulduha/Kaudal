/**
 * Codifica un Buffer al formato de entrada \x<hex> que Postgres/PostgREST
 * espera para columnas bytea (no base64, ver docs/eng/03 5.1). Se usa al
 * insertar blobs cifrados (ciphertext/iv/authTag) via PostgREST/RPC.
 *
 * El backslash va DUPLICADO en la fuente a proposito: "\x" seguido de algo que
 * no son dos digitos hex es una secuencia de escape invalida. TypeScript hoy la
 * tolera y emite el literal, pero es JS invalido segun la spec y basta cambiar
 * de transpilador para que deje de compilar (o, peor, para que se coma el
 * backslash y se escriba basura en la columna bytea).
 */
export function aBytea(buf: Buffer): string {
  return `\\x${buf.toString("hex")}`;
}
