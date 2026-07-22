import { describe, it, expect } from "vitest";
import { normalizarMateriales } from "./normalizar";

describe("normalizarMateriales", () => {
  it("limpia espacios de código y descripción (el ERP usa CHAR con relleno)", () => {
    const r = normalizarMateriales([
      { cod_prod: "  ANG130  ", descripcion: " ANGULO 1/8 ", unidad: " PZ ", existencia: 40, costo: 180.5 },
    ]);
    expect(r).toEqual([
      { codProd: "ANG130", descripcion: "ANGULO 1/8", unidad: "PZ", existencia: 40, costo: 180.5 },
    ]);
  });

  it("distingue existencia desconocida (null) de existencia cero", () => {
    const r = normalizarMateriales([
      { cod_prod: "A", descripcion: "sin fila en prodestab", unidad: null, existencia: null, costo: null },
      { cod_prod: "B", descripcion: "agotado de verdad", unidad: "PZ", existencia: 0, costo: 0 },
    ]);
    expect(r[0]!.existencia).toBeNull();
    expect(r[0]!.costo).toBeNull();
    expect(r[1]!.existencia).toBe(0);
    expect(r[1]!.costo).toBe(0);
  });

  it("acepta números que llegan como texto", () => {
    const r = normalizarMateriales([
      { cod_prod: "A", descripcion: "x", unidad: null, existencia: "12.5", costo: "3.25" },
    ]);
    expect(r[0]!.existencia).toBe(12.5);
    expect(r[0]!.costo).toBe(3.25);
  });

  it("descarta filas sin código o sin descripción, no las inventa", () => {
    const r = normalizarMateriales([
      { cod_prod: "", descripcion: "sin codigo" },
      { cod_prod: "A", descripcion: "   " },
      { cod_prod: "B", descripcion: "buena" },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0]!.codProd).toBe("B");
  });

  it("devuelve lista vacía ante basura, sin reventar", () => {
    expect(normalizarMateriales(null)).toEqual([]);
    expect(normalizarMateriales(undefined)).toEqual([]);
    expect(normalizarMateriales("no soy un arreglo")).toEqual([]);
    expect(normalizarMateriales([null, 3, "x"])).toEqual([]);
  });
});
