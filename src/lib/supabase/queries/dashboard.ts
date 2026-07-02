import { supabase } from "@/lib/supabase/client";

export interface ResumenEstado {
  estado: string;
  cantidad: number;
  total: string; // decimal-string
}

// Fila cruda de la RPC. La función rnd_dashboard_por_estado NO está en los
// tipos generados (db.ts se generó antes de crearla), así que el nombre se
// castea con `as never` y el resultado se tipa explícitamente aquí. No se
// edita db.ts a mano. supabase-js puede entregar cantidad/total como number o
// string según el driver, por eso se normalizan con Number()/String().
interface FilaResumen {
  estado: string;
  cantidad: number | string;
  total: number | string;
}

export async function resumenPorEstado(): Promise<ResumenEstado[]> {
  const { data, error } = await supabase.rpc(
    "rnd_dashboard_por_estado" as never
  );
  if (error) throw error;
  const filas = (data ?? []) as FilaResumen[];
  return filas.map((r) => ({
    estado: r.estado,
    cantidad: Number(r.cantidad),
    total: String(r.total),
  }));
}
