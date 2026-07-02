import { supabase } from "@/lib/supabase/client";
import type { EmpleadoBusqueda } from "@/lib/supabase/queries/empleados";

// El texto de la columna `sucursal` en la tabla `empleados` no usa los códigos
// del dominio (LMM/SJC/…) sino nombres largos. Este mapa traduce el código de
// la sesión al texto que hay en `empleados`.
const CODIGO_A_TEXTO_EMPLEADOS: Record<string, string> = {
  LMM: "MATRIZ",
  SJC: "SAN JOSE",
  TML: "TAMARAL",
  CLN: "CULIACAN",
  LPZ: "LA PAZ",
  CSL: "CABOS",
  FTE: "EL FUERTE",
  JJR: "JUAN JOSE RIOS",
};

// Lista los empleados activos de la sucursal dada (código del dominio), para la
// selección rápida con checkboxes al registrar comidas. Si el código no mapea,
// devuelve lista vacía (el gerente puede usar el buscador).
export async function empleadosPorSucursal(codigoSucursal: string | null): Promise<EmpleadoBusqueda[]> {
  if (!codigoSucursal) return [];
  const texto = CODIGO_A_TEXTO_EMPLEADOS[codigoSucursal];
  if (!texto) return [];

  const { data, error } = await supabase
    .from("empleados")
    .select("id, nombre, apellido, sucursal, puesto, telefono_whatsapp")
    .eq("activo", true)
    .eq("sucursal", texto)
    .order("nombre", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((e) => ({
    id: e.id as number,
    nombre: `${e.nombre} ${e.apellido}`.trim(),
    sucursal: (e.sucursal as string | null) ?? null,
    puesto: (e.puesto as string | null) ?? null,
    tieneTelefono: typeof e.telefono_whatsapp === "string" && e.telefono_whatsapp.trim() !== "",
  }));
}
