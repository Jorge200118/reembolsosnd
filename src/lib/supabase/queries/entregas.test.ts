import { describe, it, expect } from "vitest";
import { generarNumeroSolicitud } from "./entregas";

describe("generarNumeroSolicitud", () => {
  it("formato SOL-<sucursal>-<YYYYMMDD>-<HHMM>", () => {
    const fija = new Date("2026-03-15T09:07:00");
    const n = generarNumeroSolicitud("LMM", fija);
    expect(n).toBe("SOL-LMM-20260315-0907");
  });
  it("rellena con ceros mes/día/hora/minuto", () => {
    const fija = new Date("2026-01-05T03:04:00");
    expect(generarNumeroSolicitud("SJC", fija)).toBe("SOL-SJC-20260105-0304");
  });
});
