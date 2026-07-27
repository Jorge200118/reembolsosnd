/** Una partida ya entregada al empleado que todavía no se descarga del ERP. */
export interface PartidaPendiente {
  lineaId: string;
  solicitudId: string;
  folioSolicitud: string;
  codProd: string;
  descripcion: string;
  unidad: string | null;
  cantidad: number;
  costoUnitario: number | null;
  empleadoNombre: string;
  area: string | null;
  fechaEntrega: string | null;
}

/** Lo que el ERP sabe hoy de un producto en la sucursal. */
export interface ExistenciaErp {
  codProd: string;
  descripcion: string;
  unidad: string | null;
  existencia: number | null;
  costo: number | null;
  /** Producto de servicio: `modifica_inventario` sale sin tocar nada. */
  esServicio: boolean;
  /** BMS dejaría la existencia en negativo en vez de recortar. */
  permiteNegativo: boolean;
  /** false = el ERP no conoce este código en esta sucursal. */
  existe: boolean;
}

export type EstadoPartida =
  /** Alcanza el inventario: se descarga completa. */
  | "ok"
  /** Alcanza solo una parte (contando lo que ya consumieron otras partidas del mismo producto). */
  | "insuficiente"
  /** No queda nada que descargar. */
  | "sin_existencia"
  /** El ERP no conoce el código en esta sucursal. */
  | "sin_catalogo"
  /** Producto de servicio: descargarlo no haría nada en el ERP. */
  | "servicio";

export interface PartidaEvaluada extends PartidaPendiente {
  /** Existencia del ERP al momento de consultar. Null = no hay dato. */
  existencia: number | null;
  /**
   * Lo que realmente se podría descargar de esta partida, ya descontando las
   * partidas del MISMO producto que van antes en la lista.
   */
  cantidadAplicable: number;
  estado: EstadoPartida;
  /** Descripción según el ERP; la de la partida es una copia congelada al pedir. */
  descripcionErp: string;
  /** Costo promedio de hoy en el ERP. Respaldo cuando la partida no congeló uno. */
  costoErp: number | null;
  /** BMS no recortaría esta partida aunque no alcance (sucursal en negativo). */
  permiteNegativo: boolean;
  /** Se marca sola en la pantalla. Solo lo que está limpio. */
  seleccionablePorDefecto: boolean;
}

export interface TotalesPreview {
  partidas: number;
  unidades: number;
  costo: number;
}
