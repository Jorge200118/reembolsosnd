import type { Rol } from "@devoluciones/domain";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export interface Sesion {
  email: string;
  nombre: string;
  rol: Rol;          // ya normalizado en el AuthContext
  rolCrudo: string;  // el rol tal cual vino de la BD
  sucursal: string | null;
}

export interface LoginResult {
  ok: boolean;
  usuario?: { email: string; nombre: string; rol: string; sucursal: string | null };
  error?: string;
}

export async function login(email: string, password: string): Promise<LoginResult> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/login-comida`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ANON}` },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  return { ok: Boolean(data.ok), usuario: data.usuario, error: data.error };
}
