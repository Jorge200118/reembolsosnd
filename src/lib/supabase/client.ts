import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/db";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Cliente browser con anon key. El dueño DESCARTÓ el REVOKE (rompería el HTML
 * viejo que sigue en uso), así que la anon key SÍ escribe en Postgres hoy —
 * igual que el HTML viejo. La capa de queries hace lecturas y las escrituras
 * del flujo principal (crear reembolso, corte, entregas). Endurecer con RLS
 * es fase futura, cuando se retire el HTML viejo.
 */
export const supabase = createClient<Database>(url, anon, {
  auth: { persistSession: false },
});
