import { describe, it, expect } from "vitest";
import { normalizarNombre } from "./nombres";

describe("normalizarNombre", () => {
  it("mayúsculas y espacios colapsados", () => {
    expect(normalizarNombre("  Jorge Arturo   Felix Armenta  ")).toBe("JORGE ARTURO FELIX ARMENTA");
  });
  it("quita acentos y trata ñ como está (comparación consistente)", () => {
    expect(normalizarNombre("Jorge Arturo Félix Armenta")).toBe("JORGE ARTURO FELIX ARMENTA");
    expect(normalizarNombre("JORGE ENRIQUE GARCIA NUÑEZ")).toBe("JORGE ENRIQUE GARCIA NUNEZ");
  });
  it("dos escrituras equivalentes normalizan igual", () => {
    expect(normalizarNombre("josé lópez")).toBe(normalizarNombre("JOSE   LOPEZ"));
  });
});
