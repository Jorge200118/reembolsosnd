// Firma/verifica la cookie de sesión del personal (cajeras, gerentes, almacén,
// admin) con HMAC-SHA256, igual que la del empleado.
//
// Antes esta cookie era JSON pelón que escribía el propio navegador, así que
// nada de lo que dijera —rol, sucursal— podía creerse en el servidor: cualquiera
// podía editarla y decir que era gerente. Por eso las rutas de material no la
// leían: no había nada que leer. Firmándola, el servidor sí puede exigir rol y
// sucursal, que es lo que hacen /api/materiales/* y las RPCs `material_*`.
//
// El dato firmado lleva el prefijo "rnd." para que un token de escritorio y uno
// de empleado nunca puedan intercambiarse aunque compartan el secreto.
import { esArea, normalizarRol, type Area, type Rol } from "@devoluciones/domain";
import { b64urlEncode, b64urlToBytes, hmac, timingSafeEqual } from "@/lib/auth/firma";

export interface Sesion {
  email: string;
  nombre: string;
  rol: Rol; // ya normalizado
  rolCrudo: string; // el rol tal cual vino de la BD
  sucursal: string | null;
  /** Área del encargado de almacén. null = entrega todas las partidas. */
  area: Area | null;
}

const DOMINIO = "rnd.";

export async function firmarSesion(s: Sesion, secret: string): Promise<string> {
  const payload = b64urlEncode(new TextEncoder().encode(JSON.stringify(s)));
  const sig = b64urlEncode(await hmac(DOMINIO + payload, secret));
  return `${payload}.${sig}`;
}

export async function verificarSesion(token: string, secret: string): Promise<Sesion | null> {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const payload = parts[0]!;
  const sig = parts[1]!;
  const firma = b64urlToBytes(sig);
  if (!firma) return null;
  const esperado = await hmac(DOMINIO + payload, secret);
  if (!timingSafeEqual(firma, esperado)) return null;
  const datos = b64urlToBytes(payload);
  if (!datos) return null;
  try {
    const obj = JSON.parse(new TextDecoder().decode(datos));
    if (typeof obj?.email !== "string" || typeof obj?.nombre !== "string") return null;
    if (typeof obj?.rol !== "string") return null;
    if (obj.sucursal !== null && typeof obj.sucursal !== "string") return null;
    return {
      email: obj.email,
      nombre: obj.nombre,
      // Se re-normaliza al leer: así todo consumidor recibe un Rol canónico sin
      // depender de que quien firmó lo hubiera normalizado.
      rol: normalizarRol(obj.rol),
      rolCrudo: typeof obj.rolCrudo === "string" ? obj.rolCrudo : obj.rol,
      sucursal: obj.sucursal ?? null,
      // Se valida contra el catálogo al leer, igual que el rol se re-normaliza:
      // un área inventada en un token viejo vale lo mismo que no tener área.
      // Las sesiones emitidas antes de este cambio no traen el campo: quedan en
      // null y entregan todo, que es el comportamiento que ya tenían.
      area: esArea(obj.area) ? obj.area : null,
    };
  } catch {
    return null;
  }
}

export const NOMBRE_COOKIE = "rnd_sesion";
