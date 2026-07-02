"use client";
import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { normalizarRol } from "@devoluciones/domain";
import { login as loginEdge, type Sesion } from "@/lib/edge/login";
import { guardarSesion, leerSesion, borrarSesion } from "@/lib/auth/session";

interface AuthValue {
  sesion: Sesion | null;
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sesion, setSesion] = useState<Sesion | null>(() => leerSesion());

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

  return <AuthContext.Provider value={{ sesion, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}
