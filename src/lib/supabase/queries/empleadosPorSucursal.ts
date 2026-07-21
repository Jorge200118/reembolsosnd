import { supabase } from "@/lib/supabase/client";
import type { EmpleadoBusqueda } from "@/lib/supabase/queries/empleados";

// El texto de la columna `sucursal` en la tabla `empleados` no usa los códigos
// del dominio (LMM/SJC/…) sino nombres largos (MATRIZ/SAN JOSE/…). La traducción
// entre ambos vocabularios vive en la tabla `sucursales_map` (migración 0016),
// que es la fuente única de verdad: la usan también la RPC
// `comidas_pendientes_por_chofer()` y la edge function `crear-comida`.
//
// Antes este mapa estaba hardcodeado aquí. Coincidía con la tabla por suerte, no
// por diseño: dar de alta una sucursal nueva en `sucursales_map` habría dejado
// esta pantalla devolviendo vacío sin ningún error visible.
async function nombreLargoDeSucursal(codigo: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("sucursales_map")
    .select("nombre_largo")
    .eq("abrev", codigo.trim().toUpperCase())
    .maybeSingle();
  if (error) throw error;
  return (data?.nombre_largo as string | undefined) ?? null;
}

// Lista los empleados activos de la sucursal dada (código del dominio), para la
// selección rápida con checkboxes al registrar comidas. Si el código no mapea,
// devuelve lista vacía (el gerente puede usar el buscador).
export async function empleadosPorSucursal(codigoSucursal: string | null): Promise<EmpleadoBusqueda[]> {
  if (!codigoSucursal) return [];
  const texto = await nombreLargoDeSucursal(codigoSucursal);
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
