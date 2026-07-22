import { describe, it, expect } from "vitest";
import { totalDeLineas, hayFaltantes } from "./totales";
import type { LineaGuardada } from "./totales";

const LINEAS: LineaGuardada[] = [
  { id: "1", orden: 0, cod_prod: "ANG130", descripcion: "ANGULO", unidad: "PZ", cantidad: 2, costo_unitario: 180.5, existencia_al_pedir: 40, cantidad_entregada: null },
  { id: "2", orden: 1, cod_prod: "TOR001", descripcion: "TORNILLO", unidad: "PZ", cantidad: 10, costo_unitario: null, existencia_al_pedir: null, cantidad_entregada: null },
];

describe("totalDeLineas", () => {
  it("suma cantidad x costo tratando el costo desconocido como cero", () => {
    expect(totalDeLineas(LINEAS)).toBe(361);
  });

  it("una solicitud sin líneas vale cero", () => {
    expect(totalDeLineas([])).toBe(0);
  });
});

describe("hayFaltantes", () => {
  it("no marca faltante cuando todo alcanza o se desconoce", () => {
    // ANGULO: 2 pedidos de 40 que hay. TORNILLO: existencia desconocida.
    expect(hayFaltantes(LINEAS)).toBe(false);
  });

  it("no marca faltante si alcanza la existencia", () => {
    const holgado: LineaGuardada[] = [{ ...LINEAS[0]!, cantidad: 2, existencia_al_pedir: 40 }];
    expect(hayFaltantes(holgado)).toBe(false);
  });

  it("no marca faltante cuando la existencia es desconocida", () => {
    expect(hayFaltantes([LINEAS[1]!])).toBe(false);
  });

  it("marca faltante cuando la cantidad supera la existencia", () => {
    const corto: LineaGuardada[] = [{ ...LINEAS[0]!, cantidad: 100, existencia_al_pedir: 40 }];
    expect(hayFaltantes(corto)).toBe(true);
  });
});
