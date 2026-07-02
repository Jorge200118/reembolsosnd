import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/db";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Cliente browser con anon key. SOLO-LECTURA por contrato:
 * tras el REVOKE (Fase 2), la anon key no puede escribir en Postgres.
 * No exponer métodos de escritura desde la capa de queries.
 */
export const supabase = createClient<Database>(url, anon, {
  auth: { persistSession: false },
});
