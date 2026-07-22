import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { CapturaEntrega } from "./CapturaEntrega";

// Este repo no usa `test.globals: true`, así que el auto-limpiado de
// @testing-library/react no se registra solo. Mismo patrón que AvisosCard.
afterEach(cleanup);

describe("CapturaEntrega", () => {
  it("nombra a quien recoge, para que el almacenista sepa a quién pedírselo", () => {
    render(
      <CapturaEntrega codigo="" onCodigo={() => {}} onFoto={() => {}} nombreQuienRecoge="Carlos Ruiz" />,
    );
    expect(screen.getByLabelText(/código.*Carlos Ruiz/i)).toBeInTheDocument();
  });

  it("solo deja escribir dígitos, y máximo 6", () => {
    const onCodigo = vi.fn();
    render(<CapturaEntrega codigo="" onCodigo={onCodigo} onFoto={() => {}} />);
    fireEvent.change(screen.getByLabelText(/código/i), { target: { value: "4a7-2915999" } });
    expect(onCodigo).toHaveBeenCalledWith("472915");
  });

  it("avisa cuándo falta la foto", () => {
    render(<CapturaEntrega codigo="472915" onCodigo={() => {}} onFoto={() => {}} />);
    expect(screen.getByText(/falta la foto/i)).toBeInTheDocument();
  });
});
