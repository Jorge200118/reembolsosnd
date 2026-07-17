// ================================
// EDGE FUNCTION: crear-comida
// Registra una comida ($120, COMIDAS, comida_pendiente) eligiendo un empleado
// REAL de la tabla `empleados` (por id), guardando el vínculo empleado_id exacto.
// Valida: empleado activo existe, fecha no futura, no duplicado en esa fecha.
// Manda WhatsApp de aviso al chofer.
// Body: { empleado_id: number, quien_autoriza: string, usuario_registro?: string,
//         sucursal_usuario?: string, fecha?: "YYYY-MM-DD" }
// `fecha` es opcional: si no viene, se usa hoy en Mazatlán. Sirve para capturar
// un vale que se le pasó al gerente un día pasado. Nunca se aceptan futuras.
// ================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const WHATSAPP_URL = "https://recruiterhub-adp.ngrok.app/api/comidas/notificar";
const MONTO_COMIDA = 120;

// Hoy en Mazatlán como "YYYY-MM-DD". en-CA formatea justo en ese orden.
function hoyMazatlan(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mazatlan" }).format(new Date());
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método no permitido" }), { status: 405, headers: CORS_HEADERS });
  }

  try {
    const { empleado_id, quien_autoriza, usuario_registro, sucursal_usuario, fecha } = await req.json();
    if (typeof empleado_id !== "number" || typeof quien_autoriza !== "string" || quien_autoriza.trim() === "") {
      return new Response(JSON.stringify({ error: "Parámetros inválidos" }), { status: 400, headers: CORS_HEADERS });
    }

    const hoy = hoyMazatlan();

    // Fecha de la comida: la que mande el gerente, o hoy. Se valida aquí porque
    // el `max` del input en el navegador no es una garantía.
    let fechaComida = hoy;
    if (fecha !== undefined && fecha !== null && fecha !== "") {
      if (typeof fecha !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
        return new Response(JSON.stringify({ ok: false, error: "Fecha inválida" }), { status: 400, headers: CORS_HEADERS });
      }
      if (fecha > hoy) {
        return new Response(JSON.stringify({ ok: false, error: "No se pueden registrar comidas con fecha futura" }), { status: 400, headers: CORS_HEADERS });
      }
      fechaComida = fecha;
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1. Validar que el empleado exista y esté activo
    const { data: empleado, error: errE } = await supabase
      .from("empleados")
      .select("id, nombre, apellido, telefono_whatsapp, activo, sucursal")
      .eq("id", empleado_id)
      .maybeSingle();
    if (errE) throw errE;
    if (!empleado || !empleado.activo) {
      return new Response(JSON.stringify({ ok: false, error: "El empleado no existe o no está activo" }), { status: 404, headers: CORS_HEADERS });
    }
    const nombreCompleto = `${empleado.nombre} ${empleado.apellido}`.trim();

    // 2. Validar comida duplicada en esa fecha para este empleado (por empleado_id
    //    O por nombre, cubriendo ambos)
    const { data: existentes, error: errDup } = await supabase
      .from("rnd_reembolsos")
      .select("id")
      .eq("concepto", "COMIDAS")
      .eq("fecha", fechaComida)
      .or(`empleado_id.eq.${empleado_id},nombre_beneficiario.eq.${nombreCompleto}`);
    if (errDup) throw errDup;
    if (existentes && existentes.length > 0) {
      const cuando = fechaComida === hoy ? "hoy" : `el ${fechaComida}`;
      return new Response(JSON.stringify({ ok: false, error: `Este empleado ya tiene una comida registrada ${cuando}` }), { status: 409, headers: CORS_HEADERS });
    }

    // 3. Insertar la comida con el vínculo empleado_id exacto
    const { data: comida, error: errIns } = await supabase
      .from("rnd_reembolsos")
      .insert({
        nombre_beneficiario: nombreCompleto,
        empleado_id: empleado.id,
        fecha: fechaComida,
        monto: MONTO_COMIDA,
        quien_autoriza: quien_autoriza.trim(),
        quien_entrega: "",
        concepto: "COMIDAS",
        estado: "comida_pendiente",
        usuario_registro: usuario_registro ?? quien_autoriza.trim(),
        sucursal_usuario: sucursal_usuario ?? empleado.sucursal ?? null,
        archivos: [],
      })
      .select("id")
      .single();
    if (errIns) throw errIns;

    // 4. WhatsApp de aviso (no aborta si falla)
    if (empleado.telefono_whatsapp && empleado.telefono_whatsapp.trim() !== "") {
      const mensaje =
        `*ACEROS CABOS - Comida Autorizada*\n\nHola ${nombreCompleto}, se te ha autorizado una comida por *$120.00*.\n\n` +
        `Autorizó: ${quien_autoriza.trim()}\nFecha: ${fechaComida}\n\nEl pago se realizará el viernes con tu código.`;
      try {
        await fetch(WHATSAPP_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ telefono: empleado.telefono_whatsapp, mensaje }),
        });
      } catch (waErr) {
        console.error("whatsapp err", waErr);
      }
    }

    // Aviso push "comida nueva" al chofer con suscripción (fire-and-forget; no
    // aborta la creación de la comida). enviar-push calcula el total acumulado.
    try {
      await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/enviar-push`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({ tipo: "comida_nueva", empleado_id: empleado.id }),
      });
    } catch (pushErr) {
      console.error("push comida_nueva err", pushErr);
    }

    return new Response(JSON.stringify({ ok: true, comida_id: comida.id, beneficiario: nombreCompleto }), { headers: CORS_HEADERS });

  } catch (err) {
    const message = err instanceof Error ? err.message : "Error interno";
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: CORS_HEADERS });
  }
});
