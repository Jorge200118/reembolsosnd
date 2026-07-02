import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/db";

let _client: SupabaseClient<Database> | null = null;

function getClient(): SupabaseClient<Database> {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
        "Configúralas en .env.local (local) o en las variables de entorno del hosting (Netlify).",
    );
  }
  _client = createClient<Database>(url, anon, {
    auth: { persistSession: false },
  });
  return _client;
}

/**
 * Cliente browser con anon key. El dueño DESCARTÓ el REVOKE (rompería el HTML
 * viejo que sigue en uso), así que la anon key SÍ escribe en Postgres hoy —
 * igual que el HTML viejo. La capa de queries hace lecturas y las escrituras
 * del flujo principal (crear reembolso, corte, entregas). Endurecer con RLS
 * es fase futura, cuando se retire el HTML viejo.
 *
 * El cliente se crea de forma PEREZOSA (lazy): se instancia en el primer acceso
 * a una propiedad, no al importar el módulo. Así las env vars se leen en runtime
 * y no en el build/pre-render de Next.js (donde NEXT_PUBLIC_SUPABASE_URL está
 * vacía y rompería el build con "supabaseUrl is required").
 */
export const supabase = new Proxy({} as SupabaseClient<Database>, {
  get(_t, prop) {
    const c = getClient();
    const v = c[prop as keyof SupabaseClient<Database>];
    return typeof v === "function" ? v.bind(c) : v;
  },
});
