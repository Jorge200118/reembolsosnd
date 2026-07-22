import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { CapturaEntrega } from "./CapturaEntrega";

// jsdom no implementa createObjectURL/revokeObjectURL (la miniatura los usa, y
// el cleanup del efecto revoca al desmontar). Se stubean a nivel de archivo —no
// existían de todos modos— para que sigan presentes durante el desmontaje.
beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:preview") as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;
});

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

  // La foto se toma en el momento: el input pide la CÁMARA trasera, no la
  // galería. Sin esto, el almacenista podría subir una foto vieja.
  it("la foto abre la cámara, no la galería", () => {
    render(<CapturaEntrega codigo="" onCodigo={() => {}} onFoto={() => {}} />);
    const input = screen.getByLabelText(/foto de la entrega/i);
    expect(input).toHaveAttribute("capture", "environment");
    expect(input.getAttribute("accept")).toContain("image");
  });

  it("al tomar la foto avisa al padre y desaparece 'Falta la foto'", () => {
    const onFoto = vi.fn();
    render(<CapturaEntrega codigo="" onCodigo={() => {}} onFoto={onFoto} />);
    const input = screen.getByLabelText(/foto de la entrega/i);
    const foto = new File(["x"], "captura.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [foto] } });
    expect(onFoto).toHaveBeenCalledWith(foto);
    expect(screen.queryByText(/falta la foto/i)).toBeNull();
    expect(screen.getByText(/foto lista/i)).toBeInTheDocument();
  });
});
