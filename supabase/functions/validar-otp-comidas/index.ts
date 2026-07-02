// ================================
// EDGE FUNCTION: validar-otp-comidas
// La cajera captura el código; re-hashea y vía la RPC liberar_comidas_otp
// consume el OTP y libera el pago ATÓMICAMENTE.
// Body: { empleado_id: number, codigo: string, cajera_email: string }
// ================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

async function hashOtp(salt: string, codigo: string): Promise<string> {
  const data = new TextEncoder().encode(salt + codigo);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método no permitido" }), { status: 405, headers: CORS_HEADERS });
  }

  try {
    const { empleado_id, codigo, cajera_email } = await req.json();
    if (typeof empleado_id !== "number" || typeof codigo !== "string" || typeof cajera_email !== "string") {
      return new Response(JSON.stringify({ error: "Parámetros inválidos" }), { status: 400, headers: CORS_HEADERS });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const ahora = new Date();
    const mazatlan = new Date(ahora.getTime() + (ahora.getTimezoneOffset() - 7 * 60) * 60000);
    const semana = `${mazatlan.getFullYear()}-${String(mazatlan.getMonth() + 1).padStart(2, "0")}-${String(mazatlan.getDate()).padStart(2, "0")}`;

    const { data: otp, error: errOtp } = await supabase
      .from("rnd_comida_otp")
      .select("otp_salt")
      .eq("empleado_id", empleado_id)
      .eq("semana", semana)
      .maybeSingle();
    if (errOtp) throw errOtp;
    if (!otp) {
      return new Response(JSON.stringify({ ok: false, resultado: "no_encontrado" }), { headers: CORS_HEADERS });
    }

    const hashIntento = await hashOtp(otp.otp_salt as string, codigo.trim());

    const { data: resultado, error: errRpc } = await supabase.rpc("liberar_comidas_otp", {
      p_empleado_id: empleado_id,
      p_semana: semana,
      p_hash_intento: hashIntento,
      p_cajera_email: cajera_email,
    });
    if (errRpc) throw errRpc;

    const ok = resultado === "ok";
    return new Response(JSON.stringify({ ok, resultado }), {
      status: ok ? 200 : 409,
      headers: CORS_HEADERS,
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : "Error interno";
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: CORS_HEADERS });
  }
});
