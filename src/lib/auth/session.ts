// Cara de cliente de la sesión del personal. Ya no toca `document.cookie`: la
// cookie es httpOnly y la firma el servidor (ver sesionEscritorio.ts), así que
// aquí solo se conversa con los route handlers.
import type { Sesion } from "@/lib/auth/sesionEscritorio";

export async function iniciarSesion(
  email: string,
  password: string,
): Promise<{ ok: boolean; sesion?: Sesion; error?: string }> {
  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = (await res.json()) as { ok?: boolean; sesion?: Sesion; error?: string };
    if (!data.ok || !data.sesion) return { ok: false, error: data.error ?? "No se pudo iniciar sesión" };
    return { ok: true, sesion: data.sesion };
  } catch {
    return { ok: false, error: "No hay conexión" };
  }
}

export async function leerSesion(): Promise<Sesion | null> {
  try {
    const res = await fetch("/api/sesion", { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { ok?: boolean; sesion?: Sesion };
    return data.ok && data.sesion ? data.sesion : null;
  } catch {
    return null;
  }
}

export async function borrarSesion(): Promise<void> {
  try {
    await fetch("/api/logout", { method: "POST" });
  } catch {
    // Si falla, la cookie expira sola; el estado local ya se limpió igual.
  }
}

export type { Sesion };
