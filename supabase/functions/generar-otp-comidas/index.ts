// ================================
// EDGE FUNCTION: generar-otp-comidas
// Genera un OTP de 6 dígitos por chofer con comida pendiente,
// guarda SOLO el hash, y lo manda por WhatsApp.
// Idempotente por (empleado_id, semana).
// ================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const WHATSAPP_URL = "https://recruiterhub-adp.ngrok.app/api/comidas/notificar";

async function hashOtp(salt: string, codigo: string): Promise<string> {
  const data = new TextEncoder().encode(salt + codigo);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function normalizarNombre(s: string): string {
  return s.trim().toUpperCase().replace(/\s+/g, " ")
    .normalize("NFD").replace(/[̀-ͯ]/g, "");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método no permitido" }), { status: 405, headers: CORS_HEADERS });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const ahora = new Date();
    const mazatlan = new Date(ahora.getTime() + (ahora.getTimezoneOffset() - 7 * 60) * 60000);
    const yyyy = mazatlan.getFullYear();
    const mm = String(mazatlan.getMonth() + 1).padStart(2, "0");
    const dd = String(mazatlan.getDate()).padStart(2, "0");
    const semana = `${yyyy}-${mm}-${dd}`;
    const expiraEn = new Date(`${semana}T23:59:59-07:00`).toISOString();

    const { data: comidas, error: errC } = await supabase
      .from("rnd_reembolsos")
      .select("id, nombre_beneficiario, monto")
      .eq("concepto", "COMIDAS")
      .eq("estado", "comida_pendiente");
    if (errC) throw errC;
    if (!comidas || comidas.length === 0) {
      return new Response(JSON.stringify({ ok: true, generados: 0, motivo: "sin comidas pendientes" }), { headers: CORS_HEADERS });
    }

    const { data: empleados, error: errE } = await supabase
      .from("empleados")
      .select("id, nombre, apellido, telefono_whatsapp")
      .eq("activo", true);
    if (errE) throw errE;

    const porNombre = new Map<string, { id: number; telefono: string | null }>();
    for (const e of empleados ?? []) {
      const full = normalizarNombre(`${e.nombre} ${e.apellido}`);
      porNombre.set(full, { id: e.id as number, telefono: e.telefono_whatsapp as string | null });
    }

    const porEmpleado = new Map<number, { telefono: string | null; reembolsoIds: string[]; monto: number }>();
    const sinMatch: string[] = [];
    for (const c of comidas) {
      const emp = porNombre.get(normalizarNombre(String(c.nombre_beneficiario)));
      if (!emp) { sinMatch.push(String(c.nombre_beneficiario)); continue; }
      const entry = porEmpleado.get(emp.id) ?? { telefono: emp.telefono, reembolsoIds: [], monto: 0 };
      entry.reembolsoIds.push(String(c.id));
      entry.monto += Number(c.monto);
      porEmpleado.set(emp.id, entry);
    }

    let generados = 0;
    const sinTelefono: number[] = [];
    for (const [empleadoId, info] of porEmpleado) {
      if (!info.telefono || info.telefono.trim() === "") { sinTelefono.push(empleadoId); continue; }

      const { data: existente } = await supabase
        .from("rnd_comida_otp")
        .select("id, estado")
        .eq("empleado_id", empleadoId)
        .eq("semana", semana)
        .maybeSingle();
      if (existente && existente.estado === "generado") continue;

      const arr = new Uint32Array(1);
      crypto.getRandomValues(arr);
      const codigo = String(arr[0] % 1000000).padStart(6, "0");
      const salt = crypto.randomUUID();
      const hash = await hashOtp(salt, codigo);

      const { error: errUp } = await supabase.from("rnd_comida_otp").upsert({
        empleado_id: empleadoId,
        semana,
        otp_hash: hash,
        otp_salt: salt,
        estado: "generado",
        intentos: 0,
        expira_en: expiraEn,
        reembolso_ids: info.reembolsoIds,
        telefono: info.telefono,
      }, { onConflict: "empleado_id,semana" });
      if (errUp) { console.error("upsert otp err", errUp); continue; }

      const mensaje =
        `*ACEROS CABOS - Pago de Comidas*\n\nTu código para cobrar tus comidas de la semana es:\n\n*${codigo}*\n\n` +
        `Dáselo a la cajera para recibir tu pago. Vence hoy. No lo compartas con nadie más.`;
      try {
        await fetch(WHATSAPP_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ telefono: info.telefono, mensaje }),
        });
      } catch (waErr) {
        console.error("whatsapp err", waErr);
      }
      generados++;
    }

    return new Response(JSON.stringify({
      ok: true, semana, generados,
      sin_telefono: sinTelefono.length, sin_match: sinMatch.length,
    }), { headers: CORS_HEADERS });

  } catch (err) {
    const message = err instanceof Error ? err.message : "Error interno";
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: CORS_HEADERS });
  }
});
