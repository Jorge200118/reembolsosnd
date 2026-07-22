import { supabase } from "@/lib/supabase/client";

export interface SucursalEmpleado {
  /** Abreviatura (LMM, FTE...), el vocabulario de rnd_usuarios.sucursal. */
  abrev: string;
  /** cod_estab del ERP (1, 3, 5...). Null si la sucursal no lo tiene mapeado. */
  codEstab: number | null;
}

/**
 * Traduce el empleado a su sucursal en los dos vocabularios que importan aquí.
 * `empleados.sucursal` guarda el nombre largo (EL FUERTE) y `sucursales_map`
 * es la fuente única de verdad para pasar a abreviatura y a cod_estab.
 * Devuelve null si el empleado no existe, no tiene sucursal, o su sucursal no
 * está en el mapa: en ninguno de esos casos se debe adivinar una por defecto.
 */
export async function sucursalDelEmpleado(empleadoId: number): Promise<SucursalEmpleado | null> {
  const { data: emp, error: e1 } = await supabase
    .from("empleados")
    .select("sucursal")
    .eq("id", empleadoId)
    .maybeSingle();
  if (e1) throw e1;
  const larga = (emp?.sucursal as string | null)?.trim();
  if (!larga) return null;

  const { data: mapa, error: e2 } = await supabase
    .from("sucursales_map")
    .select("abrev, cod_estab")
    .eq("nombre_largo", larga.toUpperCase())
    .maybeSingle();
  if (e2) throw e2;
  if (!mapa?.abrev) return null;

  return {
    abrev: mapa.abrev as string,
    codEstab: (mapa.cod_estab as number | null) ?? null,
  };
}
