import { AREAS, type Area } from "@devoluciones/domain";

/** Una línea tal como viene de la base (nombres de columna, no camelCase). */
export interface LineaGuardada {
  id: string;
  orden: number;
  cod_prod: string;
  descripcion: string;
  unidad: string | null;
  cantidad: number;
  costo_unitario: number | null;
  existencia_al_pedir: number | null;
  cantidad_entregada: number | null;
  /** Área que la entrega. Null = la entrega cualquiera (sucursal sin áreas). */
  area: Area | null;
}

export interface SolicitudGuardada {
  id: string;
  folio: string;
  empleado_nombre: string;
  sucursal: string;
  motivo: string;
  estado: string;
  creado_en: string;
  autorizado_por: string | null;
  fecha_autorizacion: string | null;
  motivo_rechazo: string | null;
  entregado_por: string | null;
  fecha_entrega: string | null;
  evidencia_path: string | null;
  codigo_usado_en: string | null;
  rnd_material_lineas: LineaGuardada[];
}

/** Costo estimado de la solicitud. El costo desconocido cuenta como 0: es una
 *  estimación para decidir, no una cifra contable. */
export function totalDeLineas(lineas: readonly LineaGuardada[]): number {
  return lineas.reduce((acc, l) => acc + l.cantidad * (l.costo_unitario ?? 0), 0);
}

/**
 * Cuántas líneas no traen costo del ERP. Importa para no enseñar "$0" como si
 * fuera gratis: hay sucursales (Tamaral, p. ej.) donde casi ningún material
 * tiene fila de inventario, así que el total sale en cero por falta de dato y
 * no porque no cueste. El gerente autoriza con esa cifra; tiene que saber
 * cuándo no es una cifra.
 */
export function lineasSinCosto(lineas: readonly LineaGuardada[]): number {
  return lineas.filter((l) => l.costo_unitario === null).length;
}

/** ¿Alguna línea pide más de lo que había en existencia al momento de pedir?
 *  Existencia desconocida (null) no cuenta como faltante: no sabemos. */
export function hayFaltantes(lineas: readonly LineaGuardada[]): boolean {
  return lineas.some((l) => l.existencia_al_pedir !== null && l.cantidad > l.existencia_al_pedir);
}

export interface AvanceArea {
  area: Area;
  /** Partidas de esa área en la solicitud. */
  total: number;
  /** Cuántas ya tienen cantidad capturada. */
  entregadas: number;
  completa: boolean;
}

/**
 * Avance de la entrega, área por área. Sirve para "2 de 3 áreas entregadas".
 *
 * `cantidad_entregada = 0` cuenta como entregada: el encargado capturó que no
 * había, y eso es una entrega hecha, no una pendiente. Lo pendiente es null.
 */
export function resumenPorArea(lineas: readonly LineaGuardada[]): AvanceArea[] {
  const out: AvanceArea[] = [];
  for (const area of AREAS) {
    const suyas = lineas.filter((l) => l.area === area);
    if (suyas.length === 0) continue;
    const entregadas = suyas.filter((l) => l.cantidad_entregada !== null).length;
    out.push({
      area,
      total: suyas.length,
      entregadas,
      completa: entregadas === suyas.length,
    });
  }
  return out;
}
