import { areaDeZona } from "@devoluciones/domain";
import type { Material } from "./tipos";

// Los campos numéricos del ERP pueden llegar como número, como texto (mssql
// serializa DECIMAL así a veces) o ausentes. `null` significa "no hay dato" y
// NO es lo mismo que 0: un producto sin fila en prodestab no está agotado,
// simplemente no sabemos cuánto hay.
function aNumero(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function aTexto(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Convierte la respuesta cruda del ERP en materiales limpios. Nunca lanza. */
export function normalizarMateriales(crudo: unknown): Material[] {
  if (!Array.isArray(crudo)) return [];
  const out: Material[] = [];
  for (const fila of crudo) {
    if (typeof fila !== "object" || fila === null) continue;
    const f = fila as Record<string, unknown>;
    const codProd = aTexto(f.cod_prod);
    const descripcion = aTexto(f.descripcion);
    if (!codProd || !descripcion) continue;
    out.push({
      codProd,
      descripcion,
      unidad: aTexto(f.unidad) || null,
      existencia: aNumero(f.existencia),
      costo: aNumero(f.costo),
      // aTexto devuelve "" para cualquier cosa que no sea string, y areaDeZona
      // trata "" como "sin zona": una zona numérica o un objeto no se cuelan.
      area: areaDeZona(aTexto(f.zona)),
    });
  }
  return out;
}
