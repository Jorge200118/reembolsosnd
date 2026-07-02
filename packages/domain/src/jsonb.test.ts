import { describe, it, expect } from "vitest";
import { normalizarEvidencia, normalizarArchivos } from "./jsonb";

describe("jsonb normalizers", () => {
  it("evidencia como array pasa igual", () => {
    const arr = [{ url: "u", path: "p", tipo: "image/png", nombre: "a.png" }];
    expect(normalizarEvidencia(arr)).toHaveLength(1);
  });

  it("evidencia como objeto suelto se envuelve en array", () => {
    const obj = { url: "u", path: "p", tipo: "image/png", nombre: "a.png" };
    const r = normalizarEvidencia(obj);
    expect(Array.isArray(r)).toBe(true);
    expect(r).toHaveLength(1);
  });

  it("evidencia null/undefined devuelve array vacío", () => {
    expect(normalizarEvidencia(null)).toEqual([]);
    expect(normalizarEvidencia(undefined)).toEqual([]);
  });

  it("archivos malformados no rompen (filtra entradas sin url)", () => {
    const raw = [{ url: "ok", nombre: "a" }, { nombre: "sin-url" }];
    expect(normalizarArchivos(raw)).toHaveLength(1);
  });
});
