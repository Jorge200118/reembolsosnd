import { config } from "dotenv";

// Carga las credenciales de Supabase desde .env.local antes de que se
// evalúe cualquier módulo de test (y, por tanto, antes de que el cliente
// de Supabase lea process.env al importarse). Vitest no carga .env.local
// automáticamente, por eso lo hacemos aquí en un setup file.
config({ path: ".env.local" });
