// Primitivas de firma HMAC-SHA256 compartidas por las dos sesiones de la app
// (la del empleado en la PWA y la del personal en el escritorio). Usa WebCrypto
// para funcionar igual en el runtime Edge (middleware) y en Node (route handlers).
//
// Vivían dentro de empleadoSesion.ts; se sacaron aquí al firmar también la
// cookie del escritorio, para no tener dos copias del mismo código delicado.

export function b64urlEncode(bytes: Uint8Array): string {
  const s = btoa(String.fromCharCode(...bytes));
  return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Devuelve null si la cadena no es base64url válida, en vez de lanzar. Importa:
 * el valor viene de una cookie que cualquiera puede escribir a mano, y `atob`
 * lanza con basura. Cuando esto lanzaba, una cookie inventada que por casualidad
 * llevara un punto (p. ej. un JSON con un correo dentro) tumbaba el middleware
 * con un 500 en vez de mandar al login.
 */
export function b64urlToBytes(s: string): Uint8Array | null {
  try {
    const pad = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
    return Uint8Array.from(atob(pad), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

export async function hmac(data: string, secret: string): Promise<Uint8Array> {
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

/** Comparación en tiempo constante: no se corta al primer byte distinto. */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a[i]! ^ b[i]!;
  return out === 0;
}
