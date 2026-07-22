/** Un material del catálogo del ERP, ya normalizado para la app. */
export interface Material {
  codProd: string;
  descripcion: string;
  /** Abreviatura de la unidad de compra (PZ, KG, MT). Null si el ERP no la tiene. */
  unidad: string | null;
  /** Existencia en la sucursal. Null = no hay dato, distinto de 0 = agotado. */
  existencia: number | null;
  /** Costo promedio en la sucursal. Null = no hay dato. */
  costo: number | null;
}

/** Una línea de la solicitud, tal como la arma el empleado antes de enviarla. */
export interface LineaSolicitud {
  codProd: string;
  descripcion: string;
  unidad: string | null;
  cantidad: number;
  costoUnitario: number | null;
  existenciaAlPedir: number | null;
}
