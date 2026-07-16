// ================================
// EDGE FUNCTION: generar-otp-comidas
// Genera un OTP de 6 dígitos por chofer con comida pendiente,
// guarda SOLO el hash, y lo manda por WhatsApp.
// Idempotente por (empleado_id, semana).
// ================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { normalizarNombre } from "../_shared/nombres.ts";

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
      .select("id, nombre_beneficiario, monto, empleado_id")
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

    // Índice por nombre normalizado SOLO para filas legadas sin empleado_id.
    const porNombre = new Map<string, { id: number; telefono: string | null }>();
    for (const e of empleados ?? []) {
      const full = normalizarNombre(`${e.nombre} ${e.apellido}`);
      porNombre.set(full, { id: e.id as number, telefono: e.telefono_whatsapp as string | null });
    }
    // Índice de empleados por id (para teléfono cuando la comida ya trae empleado_id).
    const empById = new Map<number, { telefono: string | null }>();
    for (const e of empleados ?? []) {
      empById.set(e.id as number, { telefono: e.telefono_whatsapp as string | null });
    }

    const porEmpleado = new Map<number, { telefono: string | null; reembolsoIds: string[]; monto: number }>();
    const sinMatch: string[] = []; // nombres de comidas legadas que no cruzan
    for (const c of comidas) {
      let empId: number | null = (c.empleado_id as number | null) ?? null;
      let telefono: string | null = null;
      if (empId !== null) {
        telefono = empById.get(empId)?.telefono ?? null;
      } else {
        const emp = porNombre.get(normalizarNombre(String(c.nombre_beneficiario)));
        if (!emp) { sinMatch.push(String(c.nombre_beneficiario)); continue; }
        empId = emp.id;
        telefono = emp.telefono;
      }
      const entry = porEmpleado.get(empId) ?? { telefono, reembolsoIds: [], monto: 0 };
      entry.reembolsoIds.push(String(c.id));
      entry.monto += Number(c.monto);
      porEmpleado.set(empId, entry);
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

      const { error: errUp } = await supabase.rpc("registrar_otp_comida", {
        p_empleado_id: empleadoId,
        p_semana: semana,
        p_codigo: codigo,
        p_otp_hash: hash,
        p_otp_salt: salt,
        p_expira_en: expiraEn,
        p_reembolso_ids: info.reembolsoIds,
        p_telefono: info.telefono,
      });
      if (errUp) { console.error("registrar_otp err", errUp); continue; }

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
      sin_telefono: sinTelefono,           // lista de empleado_id
      sin_match: sinMatch,                 // lista de nombres
    }), { headers: CORS_HEADERS });

  } catch (err) {
    const message = err instanceof Error ? err.message : "Error interno";
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: CORS_HEADERS });
  }
});
