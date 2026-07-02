import { describe, it, expect } from "vitest";
import { CONCEPTOS, getConcepto } from "./conceptos";
import { AUTORIZADORES } from "./autorizadores";
import { SUCURSALES } from "./sucursales";

describe("catalogos", () => {
  it("tiene 33 conceptos con cuenta y descripcion", () => {
    expect(CONCEPTOS.length).toBe(33);
    for (const c of CONCEPTOS) {
      expect(typeof c.concepto).toBe("string");
      expect(typeof c.cuenta).toBe("string");
      expect(typeof c.descripcion).toBe("string");
    }
  });

  it("COMIDAS mapea a la cuenta correcta", () => {
    const comidas = getConcepto("COMIDAS");
    expect(comidas?.cuenta).toBe("5109-052-017");
    expect(comidas?.descripcion).toBe("CONSUMO LOCAL");
  });

  it("getConcepto de un concepto inexistente devuelve undefined", () => {
    expect(getConcepto("NO_EXISTE")).toBeUndefined();
  });

  it("tiene 25 autorizadores y 8 sucursales", () => {
    expect(AUTORIZADORES.length).toBe(25);
    expect(SUCURSALES.length).toBe(8);
  });
});
