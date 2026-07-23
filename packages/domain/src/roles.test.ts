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

  it("admin ve 5 pestañas incluyendo entregas y dashboard, sin pago-comidas", () => {
    const tabs = tabsDeRol("admin");
    expect(tabs).toContain("entregas");
    expect(tabs).toContain("dashboard");
    expect(tabs).not.toContain("pago-comidas");
    expect(tabs).not.toContain("comidas-gerente");
  });

  it("caja_chica ve 4 pestañas sin entregas ni dashboard", () => {
    const tabs = tabsDeRol("caja_chica");
    expect(tabs).toContain("nuevo-reembolso");
    expect(tabs).not.toContain("entregas");
    expect(tabs).not.toContain("dashboard");
  });

  it("gerente ve comidas y material", () => {
    expect(tabsDeRol("gerente")).toEqual(["comidas-gerente", "materiales-gerente"]);
  });
});

describe("rol autorizador", () => {
  it("normaliza 'autorizador' a 'autorizador'", () => {
    expect(normalizarRol("autorizador")).toBe("autorizador");
    expect(normalizarRol("  Autorizador ")).toBe("autorizador");
  });
  it("el autorizador solo ve el tab autorizaciones", () => {
    expect(ROL_TABS.autorizador).toEqual(["autorizaciones"]);
    expect(tabsDeRol("autorizador")).toEqual(["autorizaciones"]);
  });
});

describe("rol almacen", () => {
  it("normaliza 'almacen' y su variante con acento", () => {
    expect(normalizarRol("almacen")).toBe("almacen");
    expect(normalizarRol("  Almacén ")).toBe("almacen");
  });

  it("el almacenista solo ve su tab de entrega de material", () => {
    expect(ROL_TABS.almacen).toEqual(["materiales-almacen"]);
    expect(tabsDeRol("almacen")).toEqual(["materiales-almacen"]);
  });

  it("un rol desconocido sigue cayendo a caja_chica (mínimo privilegio)", () => {
    expect(normalizarRol("intendencia")).toBe("caja_chica");
  });

  it("admin NO ve las pestañas de material (uso interno / almacén)", () => {
    const tabs = tabsDeRol("admin");
    expect(tabs).not.toContain("materiales-gerente");
    expect(tabs).not.toContain("materiales-almacen");
  });
});
