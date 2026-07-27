import { leerTablaMaterial } from "@/lib/materiales/rpc";

// Fila cruda de `rnd_inventario_historial` (migración 0037).
interface FilaHistorial {
  id: string;
  folio_bms: string | null;
  transaccion: string;
  cod_estab: number;
  sucursal: string;
  estado: string;
  partidas: number;
  unidades: number | string;
  costo_total: number | string;
  aplicado_por: string;
  aplicado_en: string;
  cancelado_por: string | null;
  cancelado_en: string | null;
  motivo_cancelacion: string | null;
  partidas_con_diferencia: number | string;
  folios_solicitud: string | null;
}

export interface FolioHistorial {
  id: string;
  /** Null solo cuando quedó 'en_proceso': BMS asigna el folio al aplicar. */
  folioBms: string | null;
  transaccion: string;
  codEstab: number;
  sucursal: string;
  estado: "en_proceso" | "aplicada" | "cancelada" | "fallida";
  partidas: number;
  unidades: number;
  costoTotal: number;
  aplicadoPor: string;
  aplicadoEn: string;
  canceladoPor: string | null;
  canceladoEn: string | null;
  motivoCancelacion: string | null;
  /** >0 = el ERP registró algo distinto a lo pedido. Debería ser siempre 0. */
  partidasConDiferencia: number;
  /** Solicitudes de uso interno que alimentaron el folio (SUI-000050, …). */
  foliosSolicitud: string | null;
}

function aNumero(v: number | string | null | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

const ESTADOS = ["en_proceso", "aplicada", "cancelada", "fallida"] as const;

function normalizarEstado(v: string): FolioHistorial["estado"] {
  return (ESTADOS as readonly string[]).includes(v) ? (v as FolioHistorial["estado"]) : "fallida";
}

/**
 * Folios generados desde el módulo, más recientes primero.
 *
 * @param sucursal abreviatura o '*' para todas (admin).
 * @param limite   tope de filas; el historial crece sin fin y la pantalla no
 *                 necesita traerlo completo.
 */
export async function historialDeFolios(sucursal: string, limite = 100): Promise<FolioHistorial[]> {
  const filtro = sucursal === "*" ? "" : `&sucursal=eq.${encodeURIComponent(sucursal)}`;
  const filas = (await leerTablaMaterial(
    `rnd_inventario_historial?select=*${filtro}&order=aplicado_en.desc&limit=${Math.min(Math.max(1, limite), 500)}`,
  )) as FilaHistorial[];

  return filas.map((f) => ({
    id: f.id,
    folioBms: f.folio_bms,
    transaccion: f.transaccion,
    codEstab: f.cod_estab,
    sucursal: f.sucursal,
    estado: normalizarEstado(f.estado),
    partidas: aNumero(f.partidas),
    unidades: aNumero(f.unidades),
    costoTotal: aNumero(f.costo_total),
    aplicadoPor: f.aplicado_por,
    aplicadoEn: f.aplicado_en,
    canceladoPor: f.cancelado_por,
    canceladoEn: f.cancelado_en,
    motivoCancelacion: f.motivo_cancelacion,
    partidasConDiferencia: aNumero(f.partidas_con_diferencia),
    foliosSolicitud: f.folios_solicitud,
  }));
}

// ── Detalle de un folio ──────────────────────────────────────────────────────

interface FilaDetalle {
  aplicacion_id: string;
  cod_prod: string;
  descripcion: string;
  unidad: string | null;
  area: string | null;
  cantidad_solicitada: number | string;
  cantidad_aplicada: number | string;
  costo_unitario: number | string | null;
  folio_solicitud: string;
  empleado_nombre: string;
}

export interface PartidaHistorial {
  codProd: string;
  descripcion: string;
  unidad: string | null;
  area: string | null;
  cantidadSolicitada: number;
  cantidadAplicada: number;
  costoUnitario: number | null;
  folioSolicitud: string;
  empleadoNombre: string;
}

/** Qué se descargó en un folio y para quién era. */
export async function partidasDeFolio(aplicacionId: string): Promise<PartidaHistorial[]> {
  const filas = (await leerTablaMaterial(
    `rnd_inventario_historial_lineas?select=*&aplicacion_id=eq.${encodeURIComponent(aplicacionId)}`,
  )) as FilaDetalle[];

  return filas.map((f) => ({
    codProd: f.cod_prod,
    descripcion: f.descripcion,
    unidad: f.unidad,
    area: f.area,
    cantidadSolicitada: aNumero(f.cantidad_solicitada),
    cantidadAplicada: aNumero(f.cantidad_aplicada),
    costoUnitario: f.costo_unitario === null ? null : aNumero(f.costo_unitario),
    folioSolicitud: f.folio_solicitud,
    empleadoNombre: f.empleado_nombre,
  }));
}
