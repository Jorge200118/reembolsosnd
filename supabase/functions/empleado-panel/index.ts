// ================================
// EDGE FUNCTION: empleado-panel
// Llama a la RPC empleado_panel. service_role.
// Body: { empleado_id: number, regenerar?: boolean }
// El empleado_id lo pone el route handler de Next desde la sesion firmada,
// NUNCA el cliente directamente.
// ================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Metodo no permitido" }), { status: 405, headers: CORS });
  try {
    const { empleado_id, regenerar } = await req.json();
    if (typeof empleado_id !== "number") return new Response(JSON.stringify({ error: "empleado_id requerido" }), { status: 400, headers: CORS });
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data, error } = await supabase.rpc("empleado_panel", { p_empleado_id: empleado_id, p_regenerar: Boolean(regenerar) });
    if (error) throw error;
    return new Response(JSON.stringify(data), { headers: CORS });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Error interno" }), { status: 500, headers: CORS });
  }
});
