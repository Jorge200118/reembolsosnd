import { describe, it, expect } from "vitest";
import { buscarEmpleados } from "./empleados";

describe("buscarEmpleados", () => {
  it("con menos de 2 caracteres devuelve vacío", async () => {
    expect(await buscarEmpleados("a")).toEqual([]);
  });
  it("busca empleados activos por nombre (server-side, máx 10)", async () => {
    const res = await buscarEmpleados("jor");
    expect(Array.isArray(res)).toBe(true);
    expect(res.length).toBeLessThanOrEqual(10);
    const primero = res[0];
    if (primero) {
      expect(typeof primero.id).toBe("number");
      expect(typeof primero.nombre).toBe("string");
    }
  });
});
