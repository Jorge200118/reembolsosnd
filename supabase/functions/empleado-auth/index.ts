// ================================
// EDGE FUNCTION: empleado-auth
// Enruta a las RPCs de auth por `action`. service_role. NO firma sesion (eso lo
// hace el route handler de Next que firma la cookie emp_sesion).
// Body: { action: "registro"|"login"|"reset", telefono, nip?, codigo_empleado?, nip_nuevo? }
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
    const b = await req.json();
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    let data, error;
    if (b.action === "registro") {
      ({ data, error } = await supabase.rpc("empleado_registrar", { p_telefono: b.telefono, p_codigo_empleado: b.codigo_empleado, p_nip: b.nip }));
    } else if (b.action === "login") {
      ({ data, error } = await supabase.rpc("empleado_login", { p_telefono: b.telefono, p_nip: b.nip }));
    } else if (b.action === "reset") {
      ({ data, error } = await supabase.rpc("empleado_reset_nip", { p_telefono: b.telefono, p_codigo_empleado: b.codigo_empleado, p_nip: b.nip_nuevo }));
    } else {
      return new Response(JSON.stringify({ error: "action invalida" }), { status: 400, headers: CORS });
    }
    if (error) throw error;
    return new Response(JSON.stringify(data), { headers: CORS });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error interno";
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: CORS });
  }
});
