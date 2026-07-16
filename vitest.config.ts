import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // jsdom permite testear componentes React (render + DOM). Los tests que
    // no usan el DOM (p.ej. reembolsos.test.ts) funcionan igual bajo jsdom.
    environment: "jsdom",
    // Carga .env.local antes de importar los módulos de test, para que el
    // cliente de Supabase (que lee process.env al importarse) tenga las
    // credenciales disponibles.
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}", "supabase/functions/**/*.{test,spec}.ts"],
    // Los packages del workspace (p.ej. packages/domain) tienen su propio
    // vitest.config.ts. Excluirlos aquí evita que la app intente correr sus
    // tests con este setup (que carga .env.local). Se preservan los defaults
    // de vitest además de packages/**.
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.{idea,git,cache,output,temp}/**",
      "**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*",
      "packages/**",
    ],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
