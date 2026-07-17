import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

// Solo el route handler server-side (que ya verificó la cookie emp_sesion) llama
// aquí, con su service_role. Verificamos el claim role (verify_jwt ya validó la
// firma) para que un cliente con la anon key no pueda registrar endpoints ajenos.
function esServiceRole(auth: string | null): boolean {
  if (!auth || !auth.startsWith("Bearer ")) return false;
  const parts = auth.slice(7).split(".");
  if (parts.length < 2) return false;
  try {
    let b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    b64 += "=".repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(atob(b64)).role === "service_role";
  } catch {
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Metodo no permitido" }), { status: 405, headers: CORS });
  if (!esServiceRole(req.headers.get("authorization")))
    return new Response(JSON.stringify({ error: "No autorizado" }), { status: 401, headers: CORS });

  try {
    const { action, empleado_id, endpoint, p256dh, auth, user_agent } = await req.json();
    if (typeof empleado_id !== "number") return new Response(JSON.stringify({ error: "empleado_id invalido" }), { status: 400, headers: CORS });
    if (typeof endpoint !== "string" || !endpoint) return new Response(JSON.stringify({ error: "endpoint invalido" }), { status: 400, headers: CORS });

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    if (action === "suscribir") {
      if (typeof p256dh !== "string" || typeof auth !== "string")
        return new Response(JSON.stringify({ error: "llaves invalidas" }), { status: 400, headers: CORS });
      const { error } = await supabase.rpc("push_suscribir", {
        p_empleado_id: empleado_id, p_endpoint: endpoint, p_p256dh: p256dh, p_auth: auth, p_user_agent: user_agent ?? null,
      });
      if (error) throw error;
    } else if (action === "desuscribir") {
      const { error } = await supabase.rpc("push_desuscribir", { p_empleado_id: empleado_id, p_endpoint: endpoint });
      if (error) throw error;
    } else {
      return new Response(JSON.stringify({ error: "action invalida" }), { status: 400, headers: CORS });
    }
    return new Response(JSON.stringify({ ok: true }), { headers: CORS });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Error interno" }), { status: 500, headers: CORS });
  }
});
