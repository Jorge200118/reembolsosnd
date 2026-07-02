import { describe, it, expect } from "vitest";
import { normalizarRol, ROL_TABS, tabsDeRol } from "./roles";

describe("roles", () => {
  it("normaliza administracion a admin (fix del bug)", () => {
    expect(normalizarRol("administracion")).toBe("admin");
    expect(normalizarRol("ADMINISTRACION")).toBe("admin");
  });

  it("normaliza con trim y lowercase", () => {
    expect(normalizarRol("  Caja_Chica ")).toBe("caja_chica");
  });

  it("admin ve 6 pestañas incluyendo entregas y dashboard", () => {
    const tabs = tabsDeRol("admin");
    expect(tabs).toContain("entregas");
    expect(tabs).toContain("dashboard");
    expect(tabs).toContain("pago-comidas");
    expect(tabs).not.toContain("comidas-gerente");
  });

  it("caja_chica ve 4 pestañas sin entregas ni dashboard", () => {
    const tabs = tabsDeRol("caja_chica");
    expect(tabs).toContain("nuevo-reembolso");
    expect(tabs).not.toContain("entregas");
    expect(tabs).not.toContain("dashboard");
  });

  it("gerente solo ve comidas-gerente", () => {
    expect(tabsDeRol("gerente")).toEqual(["comidas-gerente"]);
  });
});
