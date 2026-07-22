import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { BarraInferior } from "./BarraInferior";

// Este repo no usa `test.globals: true`, así que el auto-limpiado de
// @testing-library/react no se registra solo. Mismo patrón que AvisosCard.
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const { mockPathname } = vi.hoisted(() => ({ mockPathname: vi.fn(() => "/empleado") }));
vi.mock("next/navigation", () => ({ usePathname: mockPathname }));

describe("BarraInferior", () => {
  it("muestra los dos módulos de la plataforma", () => {
    mockPathname.mockReturnValue("/empleado");
    render(<BarraInferior />);
    expect(screen.getByRole("link", { name: /vales/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /uso interno/i })).toBeInTheDocument();
  });

  it("marca Vales como activo en la home, no Uso interno", () => {
    mockPathname.mockReturnValue("/empleado");
    render(<BarraInferior />);
    expect(screen.getByRole("link", { name: /vales/i })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /uso interno/i })).not.toHaveAttribute("aria-current");
  });

  it("marca Uso interno como activo dentro de su módulo", () => {
    mockPathname.mockReturnValue("/empleado/materiales");
    render(<BarraInferior />);
    expect(screen.getByRole("link", { name: /uso interno/i })).toHaveAttribute("aria-current", "page");
    // "/empleado" es prefijo de todo: si se comparara con startsWith, Vales
    // saldría activo en TODAS las pantallas.
    expect(screen.getByRole("link", { name: /vales/i })).not.toHaveAttribute("aria-current");
  });

  it("no se dibuja en las pantallas sin sesión", () => {
    for (const ruta of ["/empleado/login", "/empleado/registro", "/empleado/reset"]) {
      mockPathname.mockReturnValue(ruta);
      const { container } = render(<BarraInferior />);
      expect(container).toBeEmptyDOMElement();
      cleanup();
    }
  });

  it("reserva espacio para que la barra no tape el contenido", () => {
    mockPathname.mockReturnValue("/empleado");
    const { container } = render(<BarraInferior />);
    expect(container.querySelector(".carnet-barra-espacio")).toBeInTheDocument();
  });
});
