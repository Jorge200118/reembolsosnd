"use client";
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { iniciarSesion, leerSesion, borrarSesion, type Sesion } from "@/lib/auth/session";

interface AuthValue {
  sesion: Sesion | null;
  /** false hasta que el servidor confirma quién está dentro. Evita hydration
   *  mismatch y evita pintar pantallas con una sesión a medias. */
  montado: boolean;
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  // Empezamos en null (igual que el servidor) y preguntamos por la sesión tras
  // montar. Ya no se lee la cookie: es httpOnly, la verifica /api/sesion.
  const [sesion, setSesion] = useState<Sesion | null>(null);
  const [montado, setMontado] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let vivo = true;
    leerSesion().then((s) => {
      if (!vivo) return;
      setSesion(s);
      setMontado(true);
    });
    return () => {
      vivo = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const r = await iniciarSesion(email, password);
    if (!r.ok || !r.sesion) return { ok: false, error: r.error ?? "Error" };
    setSesion(r.sesion);
    return { ok: true };
  }, []);

  const logout = useCallback(() => {
    setSesion(null);
    borrarSesion().finally(() => router.replace("/login"));
  }, [router]);

  return <AuthContext.Provider value={{ sesion, montado, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}
