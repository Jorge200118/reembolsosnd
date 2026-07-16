import { describe, it, expect } from "vitest";
import { firmarEmpSesion, verificarEmpSesion } from "@/lib/auth/empleadoSesion";

// Verifica el CONTRATO de sesión que usa el middleware (la función pura),
// no el redirect de Next (que requiere levantar el runtime).
describe("middleware empleado (contrato de sesión)", () => {
  it("una cookie firmada válida resuelve a la sesión", async () => {
    const secret = "s3cr3t-middleware-test";
    const token = await firmarEmpSesion({ empleadoId: 7, nombre: "Ana" }, secret);
    expect(await verificarEmpSesion(token, secret)).toEqual({ empleadoId: 7, nombre: "Ana" });
  });
  it("sin token no hay sesión", async () => {
    expect(await verificarEmpSesion("", "x")).toBeNull();
  });
});
