import { describe, it, expect } from "vitest";
import { listarReembolsos } from "./reembolsos";

// Test de integración de solo-lectura contra la BD real (seguro: no escribe).
describe("listarReembolsos", () => {
  it("trae una página de reembolsos pendientes sin cargar todo", async () => {
    const { rows, total } = await listarReembolsos({
      estado: "pendiente",
      page: 0,
      pageSize: 20,
    });
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeLessThanOrEqual(20);
    expect(typeof total).toBe("number");
  });
});
