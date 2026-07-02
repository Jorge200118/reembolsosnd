import { describe, it, expect } from "vitest";
import { agruparPorLote } from "./agruparPorLote";

const filas = [
  { id: "1", numero_lote: "41-JOSE", monto: 100, sucursal_usuario: "LMM", numero_solicitud: null, estado: "aprobado" },
  { id: "2", numero_lote: "41-JOSE", monto: 50, sucursal_usuario: "LMM", numero_solicitud: null, estado: "aprobado" },
  { id: "3", numero_lote: "42-ANA", monto: 200, sucursal_usuario: "SJC", numero_solicitud: null, estado: "aprobado" },
  { id: "4", numero_lote: null, monto: 30, sucursal_usuario: "TML", numero_solicitud: null, estado: "aprobado" },
];

describe("agruparPorLote", () => {
  it("agrupa por numero_lote y suma montos", () => {
    const grupos = agruparPorLote(filas, "numero_lote");
    const lote41 = grupos.find((g) => g.lote === "41-JOSE")!;
    expect(lote41.reembolsos).toHaveLength(2);
    expect(lote41.total).toBe(150);
    expect(lote41.sucursal).toBe("LMM");
  });
  it("las filas sin lote caen en 'SIN_LOTE'", () => {
    const grupos = agruparPorLote(filas, "numero_lote");
    const sinLote = grupos.find((g) => g.lote === "SIN_LOTE")!;
    expect(sinLote.reembolsos).toHaveLength(1);
    expect(sinLote.total).toBe(30);
  });
  it("ordena los lotes descendentemente por clave", () => {
    const grupos = agruparPorLote(filas, "numero_lote");
    // SIN_LOTE va al final; el resto desc
    expect(grupos[0]!.lote).toBe("42-ANA");
  });
});
