import type { Sesion } from "@/lib/edge/login";

const COOKIE = "rnd_sesion";

// Guarda la sesión en una cookie (7 días). No es criptográficamente segura —
// es el mismo nivel de confianza que el localStorage del HTML viejo, pero permite
// que el middleware proteja rutas. NO guardar la contraseña.
export function guardarSesion(s: Sesion) {
  const val = encodeURIComponent(JSON.stringify(s));
  document.cookie = `${COOKIE}=${val}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;
}

export function leerSesion(): Sesion | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.split("; ").find((c) => c.startsWith(`${COOKIE}=`));
  if (!m) return null;
  try {
    return JSON.parse(decodeURIComponent(m.split("=")[1] ?? "")) as Sesion;
  } catch {
    return null;
  }
}

export function borrarSesion() {
  document.cookie = `${COOKIE}=; path=/; max-age=0`;
}

export const NOMBRE_COOKIE = COOKIE;
