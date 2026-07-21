import { supabase } from "@/lib/supabase/client";

export interface RndEmpleadoBusqueda {
  id: string;            // uuid
  codigo: string | null;
  nombre: string;        // nombre completo en un solo campo
  sucursal: string | null;
}

/**
 * Busca en `rnd_empleados` (el padrón de Reembolsos No Deducibles) por nombre o
 * código, para autocompletar el beneficiario. Es una tabla distinta de
 * `empleados` (la que usa el módulo de Comidas): aquí el nombre viene completo
 * en una sola columna y el id es uuid.
 */
export async function buscarRndEmpleados(termino: string): Promise<RndEmpleadoBusqueda[]> {
  const t = termino.trim();
  if (t.length < 2) return [];
  const { data, error } = await supabase
    .from("rnd_empleados")
    .select("id, codigo, nombre, sucursal")
    .eq("activo", true)
    .or(`nombre.ilike.%${t}%,codigo.ilike.%${t}%`)
    .order("nombre", { ascending: true })
    .limit(10);
  if (error) throw error;
  return (data ?? []).map((e) => ({
    id: e.id as string,
    codigo: (e.codigo as string | null) ?? null,
    nombre: ((e.nombre as string | null) ?? "").trim(),
    sucursal: (e.sucursal as string | null) ?? null,
  }));
}
