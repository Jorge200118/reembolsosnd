import { supabase } from "@/lib/supabase/client";
import type { Json } from "@/types/db";
import { subirArchivos, type ArchivoSubido } from "@/lib/storage/subirArchivos";

export interface NuevoReembolsoInput {
  nombreBeneficiario: string;
  fecha: string;         // "YYYY-MM-DD"
  monto: number;
  quienAutoriza: string;
  concepto: string;
  archivos: File[];
  // de la sesión:
  quienEntrega: string;  // sesion.nombre
  usuarioRegistro: string; // sesion.email
  sucursalUsuario: string | null; // sesion.sucursal
}

export interface CrearReembolsoResult {
  ok: boolean;
  id?: string;
  archivosSubidos?: number;
  error?: string;
}

// Sube los comprobantes y crea el reembolso en estado 'pendiente'.
// Insert idéntico al HTML viejo (V4 L2257). Requiere >=1 archivo subido.
export async function crearReembolso(input: NuevoReembolsoInput): Promise<CrearReembolsoResult> {
  let subidos: ArchivoSubido[];
  try {
    subidos = await subirArchivos(input.archivos, "reembolsos");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error subiendo archivos" };
  }
  if (subidos.length === 0) {
    return { ok: false, error: "No se pudieron subir los archivos" };
  }

  const { data, error } = await supabase
    .from("rnd_reembolsos")
    .insert({
      nombre_beneficiario: input.nombreBeneficiario,
      fecha: input.fecha,
      monto: input.monto,
      quien_autoriza: input.quienAutoriza,
      quien_entrega: input.quienEntrega,
      concepto: input.concepto,
      estado: "pendiente",
      usuario_registro: input.usuarioRegistro,
      sucursal_usuario: input.sucursalUsuario,
      archivos: subidos as unknown as Json,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data?.id as string, archivosSubidos: subidos.length };
}
