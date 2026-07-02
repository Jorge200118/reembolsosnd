import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // El dominio es puro TS sin red ni env; no necesita setup de .env.
    // Config propio para NO heredar el vitest.config.ts de la raíz (app).
    include: ["src/**/*.test.ts"],
  },
});
