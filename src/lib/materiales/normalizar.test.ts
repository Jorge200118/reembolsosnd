import { describe, it, expect } from "vitest";
import { normalizarMateriales } from "./normalizar";

describe("normalizarMateriales", () => {
  it("limpia espacios de código y descripción (el ERP usa CHAR con relleno)", () => {
    const r = normalizarMateriales([
      { cod_prod: "  ANG130  ", descripcion: " ANGULO 1/8 ", unidad: " PZ ", existencia: 40, costo: 180.5 },
    ]);
    expect(r).toEqual([
      { codProd: "ANG130", descripcion: "ANGULO 1/8", unidad: "PZ", existencia: 40, costo: 180.5, area: null },
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

describe("normalizarMateriales — área", () => {
  it("deriva el área desde la zona que manda el ERP", () => {
    const r = normalizarMateriales([
      { cod_prod: "FER001", descripcion: "PIJA 2\"", zona: "PASILLO FERR IZQ" },
      { cod_prod: "VAR001", descripcion: "VARILLA 3/8", zona: "N1 P1 DER" },
      { cod_prod: "PTR001", descripcion: "PTR 2X2", zona: "N3 LINEAL" },
    ]);
    expect(r.map((m) => m.area)).toEqual(["FERRETERIA", "NAVE1", "NAVE3"]);
  });

  it("deja el área en null cuando el producto no tiene zona", () => {
    const r = normalizarMateriales([
      { cod_prod: "PRI010", descripcion: "KITOX BLANCO", zona: null },
      { cod_prod: "TRU123", descripcion: "MARTILLO" },
      { cod_prod: "CEM095", descripcion: "MULTIPLAST", zona: "   " },
    ]);
    expect(r.map((m) => m.area)).toEqual([null, null, null]);
  });

  it("ignora una zona que no sea texto", () => {
    const r = normalizarMateriales([
      { cod_prod: "X1", descripcion: "COSA", zona: 42 },
    ]);
    expect(r[0]!.area).toBeNull();
  });
});
