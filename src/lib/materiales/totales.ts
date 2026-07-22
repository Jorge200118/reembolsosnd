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
}

export interface SolicitudGuardada {
  id: string;
  folio: string;
  empleado_nombre: string;
  sucursal: string;
  nota: string | null;
  estado: string;
  creado_en: string;
  autorizado_por: string | null;
  fecha_autorizacion: string | null;
  motivo_rechazo: string | null;
  entregado_por: string | null;
  fecha_entrega: string | null;
  rnd_material_lineas: LineaGuardada[];
}

/** Costo estimado de la solicitud. El costo desconocido cuenta como 0: es una
 *  estimación para decidir, no una cifra contable. */
export function totalDeLineas(lineas: readonly LineaGuardada[]): number {
  return lineas.reduce((acc, l) => acc + l.cantidad * (l.costo_unitario ?? 0), 0);
}

/** ¿Alguna línea pide más de lo que había en existencia al momento de pedir?
 *  Existencia desconocida (null) no cuenta como faltante: no sabemos. */
export function hayFaltantes(lineas: readonly LineaGuardada[]): boolean {
  return lineas.some((l) => l.existencia_al_pedir !== null && l.cantidad > l.existencia_al_pedir);
}
