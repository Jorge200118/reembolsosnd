import type { Material, LineaSolicitud } from "./tipos";

// El carrito es un arreglo inmutable de líneas. Todo lo que viene del ERP
// (costo y existencia) se congela aquí, en el momento de agregar: es el dato
// que se guardará en la solicitud y que verá el gerente al autorizar.

function esCantidadValida(n: number): boolean {
  return Number.isFinite(n) && n > 0;
}

export function agregarMaterial(
  lineas: readonly LineaSolicitud[],
  material: Material,
  cantidad: number,
): LineaSolicitud[] {
  if (!esCantidadValida(cantidad)) return [...lineas];
  const i = lineas.findIndex((l) => l.codProd === material.codProd);
  if (i >= 0) {
    const copia = [...lineas];
    copia[i] = { ...copia[i]!, cantidad: copia[i]!.cantidad + cantidad };
    return copia;
  }
  return [
    ...lineas,
    {
      codProd: material.codProd,
      descripcion: material.descripcion,
      unidad: material.unidad,
      cantidad,
      costoUnitario: material.costo,
      existenciaAlPedir: material.existencia,
    },
  ];
}

export function cambiarCantidad(
  lineas: readonly LineaSolicitud[],
  codProd: string,
  cantidad: number,
): LineaSolicitud[] {
  if (!esCantidadValida(cantidad)) return lineas.filter((l) => l.codProd !== codProd);
  return lineas.map((l) => (l.codProd === codProd ? { ...l, cantidad } : l));
}

export function quitarMaterial(
  lineas: readonly LineaSolicitud[],
  codProd: string,
): LineaSolicitud[] {
  return lineas.filter((l) => l.codProd !== codProd);
}

/** Suma cantidad x costo. El costo desconocido cuenta como 0: es una estimación,
 *  no una cifra contable, y es mejor quedarse corto que inventar un precio. */
export function totalEstimado(lineas: readonly LineaSolicitud[]): number {
  return lineas.reduce((acc, l) => acc + l.cantidad * (l.costoUnitario ?? 0), 0);
}
