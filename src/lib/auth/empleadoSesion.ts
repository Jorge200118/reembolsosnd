// Firma/verifica la cookie de sesión del empleado con HMAC-SHA256.
// Compatible con Edge runtime (middleware) y Node (route handlers).
//
// OJO: el dato firmado es el payload pelón, sin prefijo de dominio. Se deja así
// a propósito para no invalidar las sesiones que los choferes ya traen en el
// teléfono. La cookie del escritorio (sesionEscritorio.ts) sí lleva prefijo, y
// como esta valida además la forma (empleadoId numérico), un token no se puede
// pasar por el otro.
import { b64urlEncode, b64urlToBytes, hmac, timingSafeEqual } from "@/lib/auth/firma";

export interface EmpSesion {
  empleadoId: number;
  nombre: string;
}

export async function firmarEmpSesion(s: EmpSesion, secret: string): Promise<string> {
  const payload = b64urlEncode(new TextEncoder().encode(JSON.stringify(s)));
  const sig = b64urlEncode(await hmac(payload, secret));
  return `${payload}.${sig}`;
}

export async function verificarEmpSesion(token: string, secret: string): Promise<EmpSesion | null> {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const payload = parts[0]!;
  const sig = parts[1]!;
  const firma = b64urlToBytes(sig);
  if (!firma) return null;
  const esperado = await hmac(payload, secret);
  if (!timingSafeEqual(firma, esperado)) return null;
  const datos = b64urlToBytes(payload);
  if (!datos) return null;
  try {
    const obj = JSON.parse(new TextDecoder().decode(datos));
    if (typeof obj?.empleadoId !== "number" || typeof obj?.nombre !== "string") return null;
    return { empleadoId: obj.empleadoId, nombre: obj.nombre };
  } catch {
    return null;
  }
}

export const NOMBRE_COOKIE_EMP = "emp_sesion";
