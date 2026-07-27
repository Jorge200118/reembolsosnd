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
