import { supabase } from "@/lib/supabase/client";

export interface EmpleadoBusqueda {
  id: number;
  nombre: string;        // nombre completo "Nombre Apellido"
  sucursal: string | null;
  puesto: string | null;
  tieneTelefono: boolean;
}

// Busca empleados activos por nombre o apellido (para autocompletar). Server-side, limitado.
export async function buscarEmpleados(termino: string): Promise<EmpleadoBusqueda[]> {
  const t = termino.trim();
  if (t.length < 2) return [];
  const { data, error } = await supabase
    .from("empleados")
    .select("id, nombre, apellido, sucursal, puesto, telefono_whatsapp")
    .eq("activo", true)
    .or(`nombre.ilike.%${t}%,apellido.ilike.%${t}%`)
    .order("nombre", { ascending: true })
    .limit(10);
  if (error) throw error;
  return (data ?? []).map((e) => ({
    id: e.id as number,
    nombre: `${e.nombre} ${e.apellido}`.trim(),
    sucursal: (e.sucursal as string | null) ?? null,
    puesto: (e.puesto as string | null) ?? null,
    tieneTelefono: typeof e.telefono_whatsapp === "string" && e.telefono_whatsapp.trim() !== "",
  }));
}
