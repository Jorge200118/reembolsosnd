import { supabase } from "@/lib/supabase/client";

export interface Cajera {
  email: string;
  nombre: string;
}

// Usuarios activos que pueden cobrar comidas (caja_chica / admin / administracion).
export async function listarCajeras(): Promise<Cajera[]> {
  const { data, error } = await supabase
    .from("rnd_usuarios")
    .select("email, nombre, rol, activo")
    .eq("activo", true);
  if (error) throw error;
  const roles = ["caja_chica", "admin", "administracion"];
  return (data ?? [])
    .filter((u) => roles.includes(String(u.rol).trim().toLowerCase()))
    .map((u) => ({ email: String(u.email), nombre: String(u.nombre) }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
}
