import { describe, it, expect, vi, afterEach } from "vitest";
import { aISOLocal, hoyLocal, maxDesdeHoy } from "./useHoyVivo";

afterEach(() => {
  vi.useRealTimers();
});

describe("aISOLocal", () => {
  it("usa el día LOCAL, no el UTC", () => {
    // 24-jul-2026 19:19 hora local. En UTC-7 esto es el 25 en UTC:
    // toISOString() habría devuelto "2026-07-25" y corrido el vale un día.
    const d = new Date(2026, 6, 24, 19, 19, 0);
    expect(aISOLocal(d)).toBe("2026-07-24");
  });

  it("rellena mes y día con cero a la izquierda", () => {
    expect(aISOLocal(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("hoyLocal", () => {
  it("devuelve el día en curso en hora local", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 24, 23, 30, 0));
    expect(hoyLocal()).toBe("2026-07-24");
  });
});

describe("maxDesdeHoy", () => {
  it("permite hasta mañana", () => {
    expect(maxDesdeHoy("2026-07-24")).toBe("2026-07-25");
  });

  it("cruza fin de mes", () => {
    expect(maxDesdeHoy("2026-07-31")).toBe("2026-08-01");
  });

  it("cruza fin de año", () => {
    expect(maxDesdeHoy("2026-12-31")).toBe("2027-01-01");
  });

  it("cruza el 28 de febrero en año bisiesto", () => {
    expect(maxDesdeHoy("2028-02-28")).toBe("2028-02-29");
  });

  it("reproduce el bug de la captura bloqueada", () => {
    // La pestaña se abrió el 20-jul y el max quedó congelado en 2026-07-21.
    // Cinco días después la cajera captura con fecha 24-jul y el navegador
    // la bloqueaba. Con el día vivo, el tope ya es 25-jul y el 24 pasa.
    const topeCongelado = maxDesdeHoy("2026-07-20");
    expect(topeCongelado).toBe("2026-07-21");
    expect("2026-07-24" > topeCongelado).toBe(true); // bloqueado (bug)

    const topeVivo = maxDesdeHoy("2026-07-24");
    expect("2026-07-24" > topeVivo).toBe(false); // pasa (arreglado)
  });
});
