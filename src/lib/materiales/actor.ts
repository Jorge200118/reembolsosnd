import { cookies } from "next/headers";
import { tabsDeRol, esArea, type TabId, type Area } from "@devoluciones/domain";
import { verificarSesion, NOMBRE_COOKIE } from "@/lib/auth/sesionEscritorio";

// Quién está haciendo la operación, sacado de la cookie FIRMADA y de ningún
// otro lado. Antes el nombre venía en el body y la sucursal ni se miraba: el
// que llamara la ruta decidía quién aparecía en `autorizado_por` y sobre qué
// sucursal actuaba. Ahora las dos cosas salen de la sesión verificada.

export interface Actor {
  nombre: string;
  /** Abreviatura (LMM, FTE…) o '*' para admin, que ve todas. */
  sucursal: string;
  /**
   * Área que le toca entregar. Null = entrega todas las partidas, que es como
   * funcionan las sucursales sin áreas. Sale de la sesión firmada y de ningún
   * otro lado: si viniera del body, cualquiera diría ser de Ferretería.
   */
  area: Area | null;
}

export type ResultadoActor = { ok: true; actor: Actor } | { ok: false; error: string; status: number };

/**
 * @param tab pantalla que respalda la operación. El permiso se deriva de
 * ROL_TABS y no de una lista aparte, para que la ruta y el middleware no puedan
 * discrepar: si tu rol no ve la pantalla, tampoco puede llamar a su API.
 */
export async function actorDeMaterial(tab: TabId): Promise<ResultadoActor> {
  const secret = process.env.EMP_SESION_SECRET ?? "";
  const token = (await cookies()).get(NOMBRE_COOKIE)?.value ?? "";
  const sesion = secret && token ? await verificarSesion(token, secret) : null;
  if (!sesion) return { ok: false, error: "No autorizado", status: 401 };

  if (!tabsDeRol(sesion.rol).includes(tab)) {
    return { ok: false, error: "Tu rol no puede hacer esta operación", status: 403 };
  }

  // El admin no está amarrado a una sucursal; los demás sí, y sin ella no se
  // puede decidir qué solicitudes le tocan, así que se rechaza en vez de abrir.
  const sucursal = sesion.rol === "admin" ? "*" : (sesion.sucursal ?? "").trim();
  if (!sucursal) {
    return { ok: false, error: "Tu usuario no tiene sucursal asignada, avisa a sistemas", status: 409 };
  }

  // esArea filtra cualquier valor que no sea una de las cuatro: un área
  // desconocida vale lo mismo que no tener área (entrega todo), nunca un
  // permiso nuevo.
  const area = esArea(sesion.area) ? sesion.area : null;

  return { ok: true, actor: { nombre: sesion.nombre, sucursal, area } };
}
