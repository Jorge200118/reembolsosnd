import { supabase } from "@/lib/supabase/client";
import { subirArchivos } from "@/lib/storage/subirArchivos";

// numeroSolicitud = "SOL-${sucursal}-${YYYYMMDD}-${HHMM}" (V4 L2818).
// Acepta una fecha inyectable para testear; por defecto usa la actual.
export function generarNumeroSolicitud(sucursal: string, fecha = new Date()): string {
  const y = fecha.getFullYear();
  const mo = String(fecha.getMonth() + 1).padStart(2, "0");
  const d = String(fecha.getDate()).padStart(2, "0");
  const h = String(fecha.getHours()).padStart(2, "0");
  const mi = String(fecha.getMinutes()).padStart(2, "0");
  return `SOL-${sucursal}-${y}${mo}${d}-${h}${mi}`;
}

export interface AprobadoLite {
  id: string;
  nombre_beneficiario: string;
  monto: number;
  sucursal_usuario: string | null;
}

export interface SolicitarEntregaResult {
  ok: boolean;
  numeroSolicitud?: string;
  actualizados?: number;
  error?: string;
}

// Marca los aprobados como solicitado_entrega con un número de solicitud común.
// La sucursal sale del primer aprobado (V4 L2641). Idéntico al HTML viejo, salvo
// que fecha_solicitud_entrega no existe en el esquema → se usa updated_at.
export async function solicitarEntrega(aprobados: AprobadoLite[]): Promise<SolicitarEntregaResult> {
  if (aprobados.length === 0) return { ok: false, error: "No hay comprobantes aprobados" };
  const sucursal = aprobados[0]?.sucursal_usuario ?? "NA";
  const numeroSolicitud = generarNumeroSolicitud(sucursal);
  let actualizados = 0;
  for (const r of aprobados) {
    const { error } = await supabase
      .from("rnd_reembolsos")
      .update({ estado: "solicitado_entrega", numero_solicitud: numeroSolicitud, updated_at: new Date().toISOString() })
      .eq("id", r.id);
    if (!error) actualizados++;
  }
  return { ok: true, numeroSolicitud, actualizados };
}

export interface MarcarEntregadoResult {
  ok: boolean;
  evidenciaUrl?: string;
  actualizados?: number;
  error?: string;
}

// Sube 1 foto de evidencia a rnd-documentos/evidencias/ y marca cada reembolso
// del lote como 'entregado' con esa evidencia (V4 L6017). Directo a Supabase.
export async function marcarEntregado(
  reembolsoIds: string[],
  evidencia: File,
): Promise<MarcarEntregadoResult> {
  const subidos = await subirArchivos([evidencia], "evidencias");
  if (subidos.length === 0) return { ok: false, error: "No se pudo subir la evidencia" };
  const ev = subidos[0]!;
  const fecha = new Date().toISOString();
  let actualizados = 0;
  for (const id of reembolsoIds) {
    const { error } = await supabase
      .from("rnd_reembolsos")
      .update({
        estado: "entregado",
        evidencia_entrega: { url: ev.url, nombre: ev.nombre, fecha_subida: fecha },
        fecha_entrega: fecha,
        updated_at: fecha,
      })
      .eq("id", id);
    if (!error) actualizados++;
  }
  return { ok: true, evidenciaUrl: ev.url, actualizados };
}
