// Firma/verifica la cookie de sesión del empleado con HMAC-SHA256.
// Compatible con Edge runtime (middleware) y Node (route handlers).
export interface EmpSesion {
  empleadoId: number;
  nombre: string;
}

function b64urlEncode(bytes: Uint8Array): string {
  const s = btoa(String.fromCharCode(...bytes));
  return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlToBytes(s: string): Uint8Array {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  return Uint8Array.from(atob(pad), (c) => c.charCodeAt(0));
}

async function hmac(data: string, secret: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return new Uint8Array(sig);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a[i]! ^ b[i]!;
  return out === 0;
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
  const esperado = await hmac(payload, secret);
  if (!timingSafeEqual(b64urlToBytes(sig), esperado)) return null;
  try {
    const obj = JSON.parse(new TextDecoder().decode(b64urlToBytes(payload)));
    if (typeof obj?.empleadoId !== "number" || typeof obj?.nombre !== "string") return null;
    return { empleadoId: obj.empleadoId, nombre: obj.nombre };
  } catch {
    return null;
  }
}

export const NOMBRE_COOKIE_EMP = "emp_sesion";
