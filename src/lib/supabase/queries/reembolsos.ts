import { supabase } from "@/lib/supabase/client";
import type { Estado } from "@devoluciones/domain";

export interface FiltrosReembolso {
  estado?: Estado;
  sucursal?: string;
  usuarioRegistro?: string; // para forzar el filtro de caja_chica server-side
  page: number;
  pageSize: number;
}

export interface PaginaReembolsos {
  rows: Array<Record<string, unknown>>;
  total: number;
}

// NOTA: el monto se devuelve tal cual viene de la fila; NUNCA se suma aquí en JS.
// El formateo a dinero se hace en la capa de UI con parseMonto/Money del dominio,
// que convierte el numeric a string de forma segura (sin errores de float ni
// notación científica). No hagas aritmética con el monto en esta capa.
export async function listarReembolsos(
  f: FiltrosReembolso
): Promise<PaginaReembolsos> {
  const desde = f.page * f.pageSize;
  const hasta = desde + f.pageSize - 1;

  let q = supabase
    .from("rnd_reembolsos")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(desde, hasta);

  if (f.estado) q = q.eq("estado", f.estado);
  if (f.sucursal) q = q.eq("sucursal_usuario", f.sucursal);
  if (f.usuarioRegistro) q = q.eq("usuario_registro", f.usuarioRegistro);

  const { data, error, count } = await q;
  if (error) throw error;
  return { rows: data ?? [], total: count ?? 0 };
}
