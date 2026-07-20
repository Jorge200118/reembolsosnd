import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, renderHook } from "@testing-library/react";
import { useGuardedAction } from "./useGuardedAction";

// Componente de prueba: un botón cuyo onClick pasa por el guard.
function Boton({ handler }: { handler: () => void | Promise<unknown> }) {
  const guardado = useGuardedAction(handler);
  return (
    <button type="button" onClick={guardado}>
      clic
    </button>
  );
}

describe("useGuardedAction", () => {
  beforeEach(() => {
    // requestAnimationFrame determinista para poder liberar el lock a voluntad.
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      return setTimeout(() => cb(0), 0) as unknown as number;
    });
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    cleanup();
  });

  it("un handler síncrono corre una sola vez ante un doble-click veloz", () => {
    const fn = vi.fn();
    render(<Boton handler={fn} />);
    const btn = screen.getByRole("button");

    // Doble-tap antes de cualquier re-render (mismo tick).
    fireEvent.click(btn);
    fireEvent.click(btn);

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("libera el lock en el siguiente frame y permite un nuevo click", () => {
    const fn = vi.fn();
    render(<Boton handler={fn} />);
    const btn = screen.getByRole("button");

    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(fn).toHaveBeenCalledTimes(1);

    // Pasa el frame → se libera.
    vi.runAllTimers();

    fireEvent.click(btn);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("un handler async permanece bloqueado hasta que la promesa se resuelve", async () => {
    vi.useRealTimers(); // este caso depende de microtasks reales (finally)
    let resolver!: () => void;
    const fn = vi.fn(() => new Promise<void>((res) => { resolver = res; }));
    render(<Boton handler={fn} />);
    const btn = screen.getByRole("button");

    fireEvent.click(btn);
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(fn).toHaveBeenCalledTimes(1); // sigue en vuelo

    resolver();
    // Esperamos a que el finally() (microtask) libere el lock.
    await waitFor(() => {
      fireEvent.click(btn);
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  it("si el handler lanza, libera el lock (no queda trabado)", () => {
    // Probamos el hook directamente: al pasar por React, el sistema de eventos
    // sintéticos re-lanza el error de forma asíncrona y no se puede aseverar
    // como throw síncrono. renderHook invoca la función devuelta tal cual.
    const fn = vi.fn(() => {
      throw new Error("boom");
    });
    const { result } = renderHook(() => useGuardedAction(fn));

    expect(() => result.current()).toThrow("boom");
    // El lock se soltó pese al throw: una segunda llamada vuelve a invocar.
    expect(() => result.current()).toThrow("boom");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
