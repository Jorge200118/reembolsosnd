import { describe, it, expect } from "vitest";
import { totalDeLineas, hayFaltantes, lineasSinCosto, resumenPorArea } from "./totales";
import type { LineaGuardada } from "./totales";

const LINEAS: LineaGuardada[] = [
  { id: "1", orden: 0, cod_prod: "ANG130", descripcion: "ANGULO", unidad: "PZ", cantidad: 2, costo_unitario: 180.5, existencia_al_pedir: 40, cantidad_entregada: null, area: null },
  { id: "2", orden: 1, cod_prod: "TOR001", descripcion: "TORNILLO", unidad: "PZ", cantidad: 10, costo_unitario: null, existencia_al_pedir: null, cantidad_entregada: null, area: null },
];

describe("totalDeLineas", () => {
  it("suma cantidad x costo tratando el costo desconocido como cero", () => {
    expect(totalDeLineas(LINEAS)).toBe(361);
  });

  it("una solicitud sin líneas vale cero", () => {
    expect(totalDeLineas([])).toBe(0);
  });
});

describe("lineasSinCosto", () => {
  it("cuenta las líneas que el ERP no supo costear", () => {
    expect(lineasSinCosto(LINEAS)).toBe(1);
  });

  // En Tamaral casi ningún material tiene fila de inventario: la tarjeta debe
  // poder decir "sin costo" en vez de enseñar un $0 que parece gratis.
  it("detecta el caso en que NINGUNA línea trae costo", () => {
    const ninguna = LINEAS.map((l) => ({ ...l, costo_unitario: null }));
    expect(lineasSinCosto(ninguna)).toBe(ninguna.length);
    expect(totalDeLineas(ninguna)).toBe(0);
  });

  it("no cuenta un costo de cero como desconocido", () => {
    expect(lineasSinCosto([{ ...LINEAS[0]!, costo_unitario: 0 }])).toBe(0);
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

const linea = (over: Partial<LineaGuardada>): LineaGuardada => ({
  id: crypto.randomUUID(),
  orden: 1,
  cod_prod: "X",
  descripcion: "X",
  unidad: "PZ",
  cantidad: 1,
  costo_unitario: null,
  existencia_al_pedir: null,
  cantidad_entregada: null,
  area: null,
  ...over,
});

describe("resumenPorArea", () => {
  it("agrupa las líneas por área y cuenta lo entregado", () => {
    const r = resumenPorArea([
      linea({ area: "FERRETERIA", cantidad_entregada: 5 }),
      linea({ area: "FERRETERIA", cantidad_entregada: 2 }),
      linea({ area: "NAVE2", cantidad_entregada: null }),
    ]);
    expect(r).toEqual([
      { area: "FERRETERIA", total: 2, entregadas: 2, completa: true },
      { area: "NAVE2", total: 1, entregadas: 0, completa: false },
    ]);
  });

  it("una entrega de cero cuenta como entregada", () => {
    const r = resumenPorArea([linea({ area: "NAVE1", cantidad_entregada: 0 })]);
    expect(r[0]!.completa).toBe(true);
    expect(r[0]!.entregadas).toBe(1);
  });

  it("respeta el orden del catálogo, no el de las líneas", () => {
    const r = resumenPorArea([
      linea({ area: "NAVE3" }),
      linea({ area: "FERRETERIA" }),
      linea({ area: "NAVE1" }),
    ]);
    expect(r.map((x) => x.area)).toEqual(["FERRETERIA", "NAVE1", "NAVE3"]);
  });

  it("ignora las líneas sin área", () => {
    expect(resumenPorArea([linea({ area: null })])).toEqual([]);
  });

  it("devuelve vacío sin líneas", () => {
    expect(resumenPorArea([])).toEqual([]);
  });
});
