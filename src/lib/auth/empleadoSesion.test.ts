import { describe, it, expect } from "vitest";
import { firmarEmpSesion, verificarEmpSesion } from "./empleadoSesion";

const SECRET = "secreto-de-prueba-super-largo-0123456789";

describe("empleadoSesion", () => {
  it("firma y verifica un payload válido", async () => {
    const token = await firmarEmpSesion({ empleadoId: 42, nombre: "Jorge" }, SECRET);
    const payload = await verificarEmpSesion(token, SECRET);
    expect(payload).toEqual({ empleadoId: 42, nombre: "Jorge" });
  });
  it("rechaza un token manipulado", async () => {
    const token = await firmarEmpSesion({ empleadoId: 42, nombre: "Jorge" }, SECRET);
    const manipulado = token.slice(0, -2) + (token.endsWith("aa") ? "bb" : "aa");
    expect(await verificarEmpSesion(manipulado, SECRET)).toBeNull();
  });
  it("rechaza con secreto distinto", async () => {
    const token = await firmarEmpSesion({ empleadoId: 42, nombre: "Jorge" }, SECRET);
    expect(await verificarEmpSesion(token, "otro-secreto")).toBeNull();
  });
});
