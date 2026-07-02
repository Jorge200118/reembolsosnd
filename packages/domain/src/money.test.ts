import { describe, it, expect } from "vitest";
import { sumar, formatMXN, parseMonto } from "./money";

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
});
