import { supabase } from "@/lib/supabase/client";
import type { SolicitudGuardada } from "@/lib/materiales/totales";

const CAMPOS =
  "id,folio,empleado_nombre,sucursal,motivo,estado,creado_en," +
  "autorizado_por,fecha_autorizacion,motivo_rechazo,entregado_por,fecha_entrega," +
  "evidencia_path,codigo_usado_en," +
  "rnd_material_lineas(id,orden,cod_prod,descripcion,unidad,cantidad,costo_unitario,existencia_al_pedir,cantidad_entregada,area)";

export interface FiltroSolicitudes {
  /** Abreviatura de sucursal (LMM, FTE...). `null` = todas (solo admin). */
  sucursal: string | null;
  /** Estados a incluir. */
  estados: string[];
  limite?: number;
}

/**
 * Lee solicitudes de material con sus líneas. La lectura va directa con la
 * anon key, igual que el resto del escritorio; escribir es imposible por esa
 * vía (las tablas no tienen políticas de escritura, migración 0020).
 */
export async function listarSolicitudes(f: FiltroSolicitudes): Promise<SolicitudGuardada[]> {
  let q = supabase
    .from("rnd_material_solicitudes")
    .select(CAMPOS)
    .in("estado", f.estados)
    .order("creado_en", { ascending: false })
    .limit(f.limite ?? 100);

  if (f.sucursal) q = q.eq("sucursal", f.sucursal);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as SolicitudGuardada[];
}
