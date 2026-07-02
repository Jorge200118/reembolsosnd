import { supabase } from "@/lib/supabase/client";

export type EstatusComida = "ok" | "sin_telefono" | "sin_match";

export interface ComidaPendienteChofer {
  empleadoId: number | null;
  nombre: string;
  telefono: string | null;
  numComidas: number;
  total: string;      // decimal-string
  reembolsoIds: string[];
  estatus: EstatusComida;
}

interface FilaRpc {
  empleado_id: number | null;
  nombre_beneficiario: string;
  telefono: string | null;
  num_comidas: number;
  total: number | string;
  reembolso_ids: string[];
  estatus: EstatusComida;
}

export async function comidasPendientesPorChofer(): Promise<ComidaPendienteChofer[]> {
  const { data, error } = await supabase.rpc("comidas_pendientes_por_chofer" as never);
  if (error) throw error;
  const filas = (data ?? []) as unknown as FilaRpc[];
  return filas.map((r) => ({
    empleadoId: r.empleado_id,
    nombre: r.nombre_beneficiario,
    telefono: r.telefono,
    numComidas: Number(r.num_comidas),
    total: String(r.total),
    reembolsoIds: r.reembolso_ids ?? [],
    estatus: r.estatus,
  }));
}
