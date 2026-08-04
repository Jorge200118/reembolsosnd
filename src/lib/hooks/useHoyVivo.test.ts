import { describe, it, expect, vi, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { aISOLocal, hoyLocal, maxDesdeHoy, useFechaDelDia, useHoyVivo, ZONA_COMIDAS } from "./useHoyVivo";

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

  it("con zona horaria devuelve el día de esa zona, no el del celular", () => {
    vi.useFakeTimers();
    // 05:30 UTC del 5-ago son las 22:30 del 4-ago en Mazatlán (UTC-7). La edge
    // function valida contra Mazatlán: si la UI usara otro huso, el vale se
    // rechazaría por "fecha futura".
    vi.setSystemTime(new Date("2026-08-05T05:30:00Z"));
    expect(hoyLocal(ZONA_COMIDAS)).toBe("2026-08-04");
    // Mismo instante, otro huso: prueba que la zona manda y no el reloj de la
    // máquina que corre el test.
    expect(hoyLocal("Asia/Tokyo")).toBe("2026-08-05");
  });
});

describe("useHoyVivo", () => {
  it("revalida el día cuando el gerente vuelve a la app días después", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 30, 11, 48, 0));
    const { result } = renderHook(() => useHoyVivo());
    expect(result.current).toBe("2026-07-30");

    // El gerente deja la PWA abierta en el celular; cinco días después vuelve
    // a ella y el navegador dispara visibilitychange.
    vi.setSystemTime(new Date(2026, 7, 4, 11, 48, 0));
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(result.current).toBe("2026-08-04");
  });

  it("cruza la medianoche con la pestaña abierta y a la vista", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 4, 23, 59, 30));
    const { result } = renderHook(() => useHoyVivo());
    expect(result.current).toBe("2026-08-04");

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current).toBe("2026-08-05");
  });

  it("respeta la zona horaria pedida", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-05T05:30:00Z"));
    const { result } = renderHook(() => useHoyVivo(ZONA_COMIDAS));
    expect(result.current).toBe("2026-08-04");
  });
});

describe("useFechaDelDia", () => {
  it("mueve la fecha al nuevo día si nadie la había tocado", () => {
    // El bug reportado: el gerente abrió la app el 30-jul y el 4-ago el
    // selector seguía pre-llenado (y topado) en el 30.
    const { result, rerender } = renderHook(({ hoy }) => useFechaDelDia(hoy), {
      initialProps: { hoy: "2026-07-30" },
    });
    expect(result.current[0]).toBe("2026-07-30");

    rerender({ hoy: "2026-08-04" });
    expect(result.current[0]).toBe("2026-08-04");
  });

  it("no pisa la fecha pasada que el gerente eligió a propósito", () => {
    const { result, rerender } = renderHook(({ hoy }) => useFechaDelDia(hoy), {
      initialProps: { hoy: "2026-08-03" },
    });
    act(() => result.current[1]("2026-07-28"));
    expect(result.current[0]).toBe("2026-07-28");

    rerender({ hoy: "2026-08-04" });
    expect(result.current[0]).toBe("2026-07-28");
  });

  it("vuelve a seguir al día en curso después de regresar a hoy", () => {
    const { result, rerender } = renderHook(({ hoy }) => useFechaDelDia(hoy), {
      initialProps: { hoy: "2026-08-03" },
    });
    act(() => result.current[1]("2026-07-28"));
    act(() => result.current[1]("2026-08-03")); // botón "Volver a hoy"

    rerender({ hoy: "2026-08-04" });
    expect(result.current[0]).toBe("2026-08-04");
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
