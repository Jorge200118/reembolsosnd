import { supabase } from "@/lib/supabase/client";

// URL del Google Apps Script del HTML viejo (V4 L5546). NO se toca el Apps Script,
// solo se llama igual: mismo payload ENVIAR_CORREO_AUTORIZACION.
const APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbwYGG6rjqh7Jtx5U9kI58k33rZ_dv9XmRkFeu8sd2T8zyqkVQXcY_NU7kDD_NZ5-MCtYQ/exec";

export interface ReembolsoLite {
  id: string;
  nombre_beneficiario: string;
  concepto: string;
  fecha: string;
  monto: number;
  archivos?: unknown[] | null;
}

export interface EnviarACorteInput {
  reembolsosPendientes: ReembolsoLite[];
  numeroLote: string;      // solo dígitos, validado en la UI
  emailRemitente: string;  // sesion.email
  nombreRemitente: string; // sesion.nombre
  sucursalUsuario: string | null; // sesion.sucursal
}

export interface EnviarACorteResult {
  ok: boolean;
  numeroLoteCompleto?: string;
  actualizados?: number;
  error?: string;
}

// Valida que el número de lote sean solo dígitos (igual que el HTML viejo).
export function loteValido(lote: string): boolean {
  return /^\d+$/.test(lote.trim());
}

// numeroLoteCompleto = "${lote}-${PRIMER_NOMBRE_MAYUS}" (V4 L5240-5241)
export function numeroLoteCompleto(lote: string, nombreRemitente: string): string {
  const primerNombre = nombreRemitente.split(" ")[0]?.toUpperCase() ?? "";
  return `${lote.trim()}-${primerNombre}`;
}

// Llama al Apps Script (mismo payload que el HTML viejo). Devuelve { success }.
async function enviarCorreoAppsScript(data: unknown): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "ENVIAR_CORREO_AUTORIZACION", data }),
      redirect: "follow",
    });
    const text = await res.text();
    const result = JSON.parse(text);
    return result.success ? { success: true } : { success: false, error: result.error };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error de red" };
  }
}

// Manda el correo de autorización a Fernando (vía Apps Script) y, SOLO si el correo
// sale bien, cambia cada reembolso pendiente a 'en_corte' con su numero_lote.
export async function enviarACorte(input: EnviarACorteInput): Promise<EnviarACorteResult> {
  if (input.reembolsosPendientes.length === 0) {
    return { ok: false, error: "No hay comprobantes pendientes" };
  }
  if (!loteValido(input.numeroLote)) {
    return { ok: false, error: "El número de lote debe contener únicamente números" };
  }
  const loteCompleto = numeroLoteCompleto(input.numeroLote, input.nombreRemitente);
  const totalMonto = input.reembolsosPendientes.reduce((s, r) => s + Number(r.monto), 0);

  // Payload idéntico al HTML viejo (V4 L5264-5272).
  const dataCorreo = {
    reembolsos: input.reembolsosPendientes,
    emailRemitente: input.emailRemitente,
    nombreRemitente: input.nombreRemitente,
    fechaEnvio: new Date().toISOString(),
    totalMonto,
    sucursalUsuario: input.sucursalUsuario,
    numeroLoteUsuario: loteCompleto,
  };

  const correo = await enviarCorreoAppsScript(dataCorreo);
  if (!correo.success) {
    return { ok: false, error: correo.error ?? "No se pudo enviar el correo" };
  }

  // El correo salió: ahora sí cambiar estados.
  let actualizados = 0;
  for (const r of input.reembolsosPendientes) {
    const { error } = await supabase
      .from("rnd_reembolsos")
      .update({ estado: "en_corte", numero_lote: loteCompleto })
      .eq("id", r.id);
    if (!error) actualizados++;
  }
  return { ok: true, numeroLoteCompleto: loteCompleto, actualizados };
}
