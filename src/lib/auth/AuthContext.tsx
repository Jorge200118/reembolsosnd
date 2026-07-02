"use client";
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { normalizarRol } from "@devoluciones/domain";
import { login as loginEdge, type Sesion } from "@/lib/edge/login";
import { guardarSesion, leerSesion, borrarSesion } from "@/lib/auth/session";

interface AuthValue {
  sesion: Sesion | null;
  /** false durante el render del servidor y el primer render del cliente,
   *  true una vez montado. Evita hydration mismatch al leer la cookie. */
  montado: boolean;
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  // Empezamos en null (igual que el servidor, donde no hay cookie) y leemos la
  // sesión solo tras montar, para que el primer render cliente coincida con el SSR.
  const [sesion, setSesion] = useState<Sesion | null>(null);
  const [montado, setMontado] = useState(false);

  useEffect(() => {
    setSesion(leerSesion());
    setMontado(true);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const r = await loginEdge(email, password);
    if (!r.ok || !r.usuario) return { ok: false, error: r.error ?? "Error" };
    const s: Sesion = {
      email: r.usuario.email,
      nombre: r.usuario.nombre,
      rol: normalizarRol(r.usuario.rol),
      rolCrudo: r.usuario.rol,
      sucursal: r.usuario.sucursal,
    };
    guardarSesion(s);
    setSesion(s);
    return { ok: true };
  }, []);

  const logout = useCallback(() => {
    borrarSesion();
    setSesion(null);
  }, []);

  return <AuthContext.Provider value={{ sesion, montado, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}
