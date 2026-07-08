import { supabase } from "@/lib/supabase/client";

export interface AutorizarResult {
  ok: boolean;
  actualizados?: number;
  error?: string;
}

// Marca todos los reembolsos de un lote (por id) como 'aprobado', con trazabilidad.
export async function autorizarLote(
  ids: string[],
  autorizadoPor: string,
): Promise<AutorizarResult> {
  if (ids.length === 0) return { ok: false, error: "No hay reembolsos en el lote" };
  const fecha = new Date().toISOString();
  let actualizados = 0;
  for (const id of ids) {
    const { error } = await supabase
      .from("rnd_reembolsos")
      .update({ estado: "aprobado", autorizado_por: autorizadoPor, fecha_autorizacion: fecha, updated_at: fecha })
      .eq("id", id);
    if (!error) actualizados++;
  }
  return { ok: true, actualizados };
}

// Marca todos los reembolsos de un lote como 'rechazado'. El motivo es opcional.
export async function rechazarLote(
  ids: string[],
  autorizadoPor: string,
  motivo?: string,
): Promise<AutorizarResult> {
  if (ids.length === 0) return { ok: false, error: "No hay reembolsos en el lote" };
  const fecha = new Date().toISOString();
  let actualizados = 0;
  for (const id of ids) {
    const { error } = await supabase
      .from("rnd_reembolsos")
      .update({ estado: "rechazado", motivo_rechazo: motivo || null, autorizado_por: autorizadoPor, fecha_autorizacion: fecha, updated_at: fecha })
      .eq("id", id);
    if (!error) actualizados++;
  }
  return { ok: true, actualizados };
}
