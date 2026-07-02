import { describe, it, expect } from "vitest";
import { ESTADOS, TRANSICIONES, transicionValida, labelEstado } from "./estados";

describe("estados", () => {
  it("incluye todos los estados del sistema", () => {
    expect(ESTADOS).toContain("pendiente");
    expect(ESTADOS).toContain("en_corte");
    expect(ESTADOS).toContain("aprobado");
    expect(ESTADOS).toContain("solicitado_entrega");
    expect(ESTADOS).toContain("entregado");
    expect(ESTADOS).toContain("rechazado");
    expect(ESTADOS).toContain("comida_pendiente");
  });

  it("permite transiciones válidas", () => {
    expect(transicionValida("pendiente", "en_corte")).toBe(true);
    expect(transicionValida("aprobado", "solicitado_entrega")).toBe(true);
    expect(transicionValida("solicitado_entrega", "entregado")).toBe(true);
    expect(transicionValida("comida_pendiente", "pendiente")).toBe(true);
  });

  it("rechaza transiciones inválidas", () => {
    expect(transicionValida("entregado", "pendiente")).toBe(false);
    expect(transicionValida("pendiente", "entregado")).toBe(false);
  });

  it("da label legible por estado", () => {
    expect(labelEstado("comida_pendiente")).toBe("Comida pendiente");
  });
});
