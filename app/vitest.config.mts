import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    globals: false,
    testTimeout: 20_000,
    hookTimeout: 20_000,
    // Los tests de RLS comparten una sola instancia de Postgres local
    // (pool con max: 5 conexiones). Correr los archivos en secuencia evita
    // agotar el pool y hace más fácil leer los logs si algo falla.
    fileParallelism: false,
    globalSetup: [
      "./tests/rls/helpers/global-teardown.ts",
      "./tests/usage-events/helpers/global-teardown.ts",
      "./tests/portal-tickets/helpers/global-teardown.ts",
    ],
  },
});
