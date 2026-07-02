import { describe, it, expect } from "vitest";
import { sumar, formatMXN, parseMonto, MontoInvalidoError } from "./money";

describe("money", () => {
  it("suma sin error de float (0.1 + 0.2 = 0.30)", () => {
    expect(sumar(["0.1", "0.2"])).toBe("0.30");
  });

  it("suma montos de comidas (120 * 3)", () => {
    expect(sumar(["120", "120", "120"])).toBe("360.00");
  });

  it("formatea a MXN", () => {
    expect(formatMXN("360")).toBe("$360.00");
    expect(formatMXN("1234.5")).toBe("$1,234.50");
  });

  it("parsea un number de supabase-js a string seguro", () => {
    expect(parseMonto(120)).toBe("120");
    expect(parseMonto(1234.5)).toBe("1234.5");
  });

  it("redondea half-up (I1)", () => {
    expect(sumar(["10.999"])).toBe("11.00");
    expect(sumar(["10.996"])).toBe("11.00");
    expect(sumar(["0.005"])).toBe("0.01");
    expect(sumar(["0.009"])).toBe("0.01");
    expect(sumar(["10.994"])).toBe("10.99");
    expect(sumar(["0.004"])).toBe("0.00");
    expect(sumar(["0.009", "0.009"])).toBe("0.02");
  });

  it("maneja negativos", () => {
    expect(sumar(["-0.50"])).toBe("-0.50");
    expect(sumar(["-10", "9.50"])).toBe("-0.50");
  });

  it("maneja cero de forma segura", () => {
    expect(sumar(["0"])).toBe("0.00");
  });

  it("lanza MontoInvalidoError con inputs inválidos (C1/C2)", () => {
    expect(() => sumar(["abc"])).toThrow(MontoInvalidoError);
    expect(() => sumar(["1.2.3"])).toThrow(MontoInvalidoError);
    expect(() => sumar(["12.3abc"])).toThrow(MontoInvalidoError);
  });

  it("no rompe con notación científica (C2/I3)", () => {
    expect(sumar([parseMonto(1e21)])).toBe("1000000000000000000000.00");
    expect(sumar([parseMonto(0.1 + 0.2)])).toBe("0.30");
    // Exponente negativo (0.0000001) tampoco debe romper BigInt.
    expect(sumar([parseMonto(0.0000001)])).toBe("0.00");
    expect(parseMonto(1e21)).not.toMatch(/e/i);
    expect(parseMonto(0.0000001)).not.toMatch(/e/i);
  });

  it("rechaza NaN e Infinity con MontoInvalidoError", () => {
    expect(() => parseMonto(NaN)).toThrow(MontoInvalidoError);
    expect(() => parseMonto(Infinity)).toThrow(MontoInvalidoError);
    expect(() => parseMonto(-Infinity)).toThrow(MontoInvalidoError);
  });

  it("respeta el separador de miles en formatMXN", () => {
    expect(formatMXN("1,234.56")).toBe("$1,234.56");
  });
});
