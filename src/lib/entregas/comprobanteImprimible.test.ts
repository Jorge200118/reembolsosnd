import { describe, it, expect } from "vitest";
import { construirComprobanteHTML } from "./comprobanteImprimible";
import type { Fila } from "@/lib/reportes/agruparPorLote";

const reembolsos: Fila[] = [
  { id: 1, numero_lote: "686-ROSA", nombre_beneficiario: "Juan Pérez", concepto: "COMIDAS", fecha: "2026-07-20", monto: 100 },
  { id: 2, numero_lote: "686-ROSA", nombre_beneficiario: "Ana López", concepto: "COMIDAS", fecha: "2026-07-21", monto: 50 },
  { id: 3, numero_lote: "686-ROSA", nombre_beneficiario: "Luis Ruiz", concepto: "GAS", fecha: "2026-07-19", monto: 200 },
  { id: 4, numero_lote: "686-ROSA", nombre_beneficiario: "Mario Díaz", concepto: "SUELDOS", fecha: "2026-07-18", monto: 500 },
  { id: 5, numero_lote: "686-ROSA", nombre_beneficiario: "Rosa Vega", concepto: "CARGA Y DESCARGA", fecha: "2026-07-18", monto: 80 },
];

function html() {
  return construirComprobanteHTML({
    numeroSolicitud: "SOL-SJC-20260722-1700",
    sucursal: "SAN JOSE DEL CABO",
    solicitante: "Rubén Matriz",
    reembolsos,
  });
}

describe("construirComprobanteHTML", () => {
  it("incluye el encabezado formal y el número de solicitud", () => {
    const h = html();
    expect(h).toContain("ACEROS CABOS, S.A. DE C.V.");
    expect(h).toContain("SOLICITUD DE ENTREGA DE REEMBOLSOS");
    expect(h).toContain("SOL-SJC-20260722-1700");
  });

  it("muestra la tabla detallada con lote, beneficiario, concepto y fecha", () => {
    const h = html();
    expect(h).toContain("686-ROSA");
    expect(h).toContain("Juan Pérez");
    expect(h).toContain("CONCEPTO");
    expect(h).toContain("FECHA");
  });

  it("incluye el resumen por cuenta contable", () => {
    const h = html();
    expect(h).toContain("RESUMEN POR CUENTA CONTABLE");
    expect(h).toContain("5109-052-017"); // COMIDAS -> CONSUMO LOCAL
    expect(h).toContain("5109-052-020"); // GAS
    expect(h).toContain("5109-052-047"); // SUELDOS (agrupa SUELDOS + CARGA Y DESCARGA)
  });

  it("agrupa dos conceptos distintos en la misma cuenta contable", () => {
    const h = html();
    // 5109-052-047 agrupa 'SUELDOS' (500) y 'CARGA Y DESCARGA' (80) = 580.00
    expect(h).toContain("CARGA Y DESCARGA, SUELDOS");
    expect(h).toContain("$580.00");
  });

  it("calcula el total general (100+50+200+500+80 = 930)", () => {
    const h = html();
    expect(h).toContain("TOTAL A ENTREGAR");
    expect(h).toContain("$930.00");
  });

  it("incluye las firmas y el pie de página", () => {
    const h = html();
    expect(h).toContain("SOLICITA Y RECIBE");
    expect(h).toContain("ENTREGA");
    expect(h).toContain("Sistema de Reembolsos No Deducibles");
  });
});
