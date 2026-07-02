import { describe, it, expect } from "vitest";
import { debeComprimir, UMBRAL_COMPRESION } from "./comprimir";

describe("debeComprimir", () => {
  it("comprime imagen grande (>200KB)", () => {
    expect(debeComprimir("image/jpeg", 300_000)).toBe(true);
  });
  it("NO comprime imagen pequeña (<=200KB)", () => {
    expect(debeComprimir("image/png", 100_000)).toBe(false);
  });
  it("NO comprime PDF aunque sea grande", () => {
    expect(debeComprimir("application/pdf", 5_000_000)).toBe(false);
  });
  it("el umbral es 200000 bytes", () => {
    expect(UMBRAL_COMPRESION).toBe(200_000);
  });
});
