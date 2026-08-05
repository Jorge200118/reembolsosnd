import type { ExistenciaErp } from "./tipos";

// Mismo puente que usa el módulo de material (`lib/materiales/erp.ts`): esta app
// no habla con SQL Server, le pregunta a censos-web. Server-only: si la llave
// llegara al navegador quedaría a la vista.

// Más generoso que los 5s del buscador: aquí no hay nadie tecleando, y la
// consulta trae decenas de códigos de una sucursal.
const TIMEOUT_MS = 15000;

export function erpConfigurado(): boolean {
  return Boolean(process.env.CENSOS_API_URL && process.env.CENSOS_API_KEY);
}

interface RespuestaExistencias {
  ok?: boolean;
  productos?: unknown;
  permiteNegativo?: unknown;
}

function normalizarNumero(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizarProducto(raw: unknown): ExistenciaErp | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const codProd = String(o.codProd ?? "").trim().toUpperCase();
  if (!codProd) return null;
  return {
    codProd,
    descripcion: String(o.descripcion ?? ""),
    unidad: o.unidad ? String(o.unidad) : null,
    existencia: normalizarNumero(o.existencia),
    costo: normalizarNumero(o.costo),
    esServicio: o.esServicio === true,
    permiteNegativo: o.permiteNegativo === true,
    // Solo `true` explícito cuenta como "el ERP lo conoce". Ante una respuesta
    // rara, lo seguro es tratarlo como desconocido y no descargarlo.
    existe: o.existe === true,
  };
}

/**
 * Existencia y costo de una lista de códigos en una sucursal.
 * Lanza si el ERP no contesta o responde mal: quien llama decide qué hacer.
 * Aquí nunca se devuelve una lista vacía disfrazada de éxito, porque eso se
 * leería como "no hay nada que descargar" cuando en realidad el ERP se cayó.
 */
export async function existenciasEnErp(
  codProds: readonly string[],
  codEstab: number,
): Promise<{ productos: ExistenciaErp[]; permiteNegativo: boolean }> {
  const base = process.env.CENSOS_API_URL;
  const llave = process.env.CENSOS_API_KEY;
  if (!base || !llave) throw new Error("ERP no configurado");
  if (codProds.length === 0) return { productos: [], permiteNegativo: false };

  const res = await fetch(`${base.replace(/\/$/, "")}/api/inventario/existencias`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": llave,
      "ngrok-skip-browser-warning": "true",
    },
    body: JSON.stringify({ codProds, codEstab }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`ERP respondió ${res.status}`);

  const data = (await res.json()) as RespuestaExistencias;
  if (data.ok !== true) throw new Error("El ERP rechazó la consulta");

  const productos = (Array.isArray(data.productos) ? data.productos : [])
    .map(normalizarProducto)
    .filter((p): p is ExistenciaErp => p !== null);

  return { productos, permiteNegativo: data.permiteNegativo === true };
}

// ── Aplicar ──────────────────────────────────────────────────────────────────

/** Cuánto se espera del ERP al escribir. Aplicar es más pesado que consultar. */
const TIMEOUT_APLICAR_MS = 60000;

export interface PartidaAplicada {
  codProd: string;
  cantidadSolicitada: number;
  cantidadAplicada: number;
}

export type ResultadoAplicar =
  | { estado: "ok"; folio: string; partidas: PartidaAplicada[] }
  /** El ERP rechazó explícitamente. NO escribió nada: se puede reintentar. */
  | { estado: "rechazado"; codigo: string; error: string; detalle?: PartidaAplicada[] }
  /**
   * No se sabe si el ERP escribió (se cayó la red, timeout, respuesta ilegible).
   * Quien llame NO debe liberar las partidas ni reintentar a ciegas: hay que
   * mirar en BMS si el folio existe. Reintentar aquí es descargar dos veces.
   */
  | { estado: "desconocido"; error: string };

/**
 * Manda a BMS un movimiento de uso interno (transacción 40, razón 17).
 *
 * A diferencia del resto del módulo, esta función NO lanza: convierte cada
 * final posible en un estado explícito. La razón es que aquí la diferencia
 * entre "falló y no escribió" y "no sé si escribió" cambia lo que hay que hacer
 * después, y un `throw` los hace ver iguales.
 */
export async function aplicarEnErp(
  codEstab: number,
  usuario: string,
  partidas: readonly { codProd: string; cantidad: number }[],
  /** Motivos de las solicitudes; van al campo `notas` de la cabecera en BMS. */
  notas = "",
): Promise<ResultadoAplicar> {
  const base = process.env.CENSOS_API_URL;
  const llave = process.env.CENSOS_API_KEY;
  if (!base || !llave) return { estado: "rechazado", codigo: "SIN_CONFIG", error: "ERP no configurado" };

  let res: Response;
  try {
    res = await fetch(`${base.replace(/\/$/, "")}/api/inventario/aplicar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": llave,
        "ngrok-skip-browser-warning": "true",
      },
      body: JSON.stringify({ codEstab, usuario, equipo: "APP", partidas, notas }),
      signal: AbortSignal.timeout(TIMEOUT_APLICAR_MS),
      cache: "no-store",
    });
  } catch (e) {
    // La petición nunca volvió. El ERP pudo haber alcanzado a grabar.
    return { estado: "desconocido", error: e instanceof Error ? e.message : "Sin respuesta del ERP" };
  }

  let data: Record<string, unknown>;
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    return { estado: "desconocido", error: `El ERP respondió ${res.status} sin JSON` };
  }

  if (res.ok && data.ok === true && typeof data.folio === "string") {
    return {
      estado: "ok",
      folio: data.folio,
      partidas: (Array.isArray(data.partidas) ? data.partidas : []).map((p) => {
        const o = p as Record<string, unknown>;
        return {
          codProd: String(o.codProd ?? "").trim().toUpperCase(),
          cantidadSolicitada: Number(o.cantidadSolicitada),
          cantidadAplicada: Number(o.cantidadAplicada),
        };
      }),
    };
  }

  // 409 = el ERP rechazó por estado (recorte, catálogo). Nada quedó escrito.
  if (res.status === 409) {
    return {
      estado: "rechazado",
      codigo: String(data.codigo ?? "RECHAZADO"),
      error: String(data.error ?? "El ERP rechazó el movimiento"),
      detalle: Array.isArray(data.detalle)
        ? (data.detalle as Record<string, unknown>[]).map((d) => ({
            codProd: String(d.codProd ?? "").trim().toUpperCase(),
            cantidadSolicitada: Number(d.cantidadSolicitada),
            cantidadAplicada: Number(d.cantidadAplicada),
          }))
        : undefined,
    };
  }

  // 400 es culpa nuestra (petición mal armada) y tampoco escribió.
  if (res.status === 400) {
    return { estado: "rechazado", codigo: "PETICION_INVALIDA", error: String(data.error ?? "Petición inválida") };
  }

  // Cualquier otra cosa (502, 500, 504…) pudo haber dejado el folio a medias.
  return { estado: "desconocido", error: `El ERP respondió ${res.status}` };
}

export type ResultadoCancelar =
  | { estado: "ok"; folio: string; yaEstaba: boolean }
  | { estado: "rechazado"; codigo: string; error: string }
  | { estado: "desconocido"; error: string };

/**
 * Cancela en BMS un folio de uso interno: devuelve el inventario y da de baja
 * la póliza. Mismos tres finales que `aplicarEnErp` y por la misma razón — aquí
 * "no sé si se canceló" tampoco se puede tratar como "no se canceló".
 */
export async function cancelarEnErp(
  codEstab: number,
  folio: string,
  usuario: string,
  motivo: string,
): Promise<ResultadoCancelar> {
  const base = process.env.CENSOS_API_URL;
  const llave = process.env.CENSOS_API_KEY;
  if (!base || !llave) return { estado: "rechazado", codigo: "SIN_CONFIG", error: "ERP no configurado" };

  let res: Response;
  try {
    res = await fetch(`${base.replace(/\/$/, "")}/api/inventario/cancelar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": llave,
        "ngrok-skip-browser-warning": "true",
      },
      body: JSON.stringify({ codEstab, folio, usuario, equipo: "APP", motivo }),
      signal: AbortSignal.timeout(TIMEOUT_APLICAR_MS),
      cache: "no-store",
    });
  } catch (e) {
    return { estado: "desconocido", error: e instanceof Error ? e.message : "Sin respuesta del ERP" };
  }

  let data: Record<string, unknown>;
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    return { estado: "desconocido", error: `El ERP respondió ${res.status} sin JSON` };
  }

  if (res.ok && data.ok === true) {
    return {
      estado: "ok",
      folio: String(data.folio ?? folio),
      yaEstaba: data.yaEstaba === true,
    };
  }
  if (res.status === 409 || res.status === 400) {
    return {
      estado: "rechazado",
      codigo: String(data.codigo ?? "RECHAZADO"),
      error: String(data.error ?? "El ERP rechazó la cancelación"),
    };
  }
  return { estado: "desconocido", error: `El ERP respondió ${res.status}` };
}
