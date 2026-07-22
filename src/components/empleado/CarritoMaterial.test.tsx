import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { CarritoMaterial } from "./CarritoMaterial";
import type { LineaSolicitud } from "@/lib/materiales/tipos";

// Este proyecto no activa `test.globals` en vitest.config.ts, así que el
// auto-cleanup de @testing-library/react (que depende de un `afterEach`
// global) no se dispara solo. Sin esto, el DOM de un test se filtra al
// siguiente. Mismo patrón que AvisosCard.test.tsx.
afterEach(() => {
  cleanup();
});

const LINEAS: LineaSolicitud[] = [
  { codProd: "ANG130", descripcion: "ANGULO 1/8", unidad: "PZ", cantidad: 2, costoUnitario: 180.5, existenciaAlPedir: 40 },
  { codProd: "TOR001", descripcion: "TORNILLO 1/4", unidad: "PZ", cantidad: 10, costoUnitario: null, existenciaAlPedir: null },
];

describe("CarritoMaterial", () => {
  it("muestra un renglón por material con su cantidad", () => {
    render(<CarritoMaterial lineas={LINEAS} onCambiarCantidad={() => {}} onQuitar={() => {}} />);
    expect(screen.getByText("ANGULO 1/8")).toBeInTheDocument();
    expect(screen.getByText("TORNILLO 1/4")).toBeInTheDocument();
    expect(screen.getByLabelText("Cantidad de ANGULO 1/8")).toHaveValue(2);
  });

  it("avisa cuando se pide más de lo que hay en existencia", () => {
    const sinInventario: LineaSolicitud[] = [
      { ...LINEAS[0]!, cantidad: 100, existenciaAlPedir: 40 },
    ];
    render(<CarritoMaterial lineas={sinInventario} onCambiarCantidad={() => {}} onQuitar={() => {}} />);
    expect(screen.getByText(/solo hay 40/i)).toBeInTheDocument();
  });

  // El ERP tiene existencias negativas de verdad: al probar el puente, 3 de 25
  // materiales venían en negativo (ANGULO DE 1/2 X 3" estaba en -3). Decirle al
  // empleado "solo hay -3" es basura; en cero o menos, no hay y punto.
  it("con existencia cero o negativa dice que no hay, sin enseñar el número", () => {
    const enNegativo: LineaSolicitud[] = [
      { ...LINEAS[0]!, cantidad: 2, existenciaAlPedir: -3 },
    ];
    render(<CarritoMaterial lineas={enNegativo} onCambiarCantidad={() => {}} onQuitar={() => {}} />);
    expect(screen.getByText(/no hay en existencia/i)).toBeInTheDocument();
    expect(screen.queryByText(/-3/)).not.toBeInTheDocument();
  });

  it("no avisa de existencia cuando el dato es desconocido", () => {
    render(<CarritoMaterial lineas={[LINEAS[1]!]} onCambiarCantidad={() => {}} onQuitar={() => {}} />);
    expect(screen.queryByText(/solo hay/i)).not.toBeInTheDocument();
  });

  it("avisa al cambiar cantidad y al quitar", () => {
    const cambiar = vi.fn();
    const quitar = vi.fn();
    render(<CarritoMaterial lineas={LINEAS} onCambiarCantidad={cambiar} onQuitar={quitar} />);
    fireEvent.change(screen.getByLabelText("Cantidad de ANGULO 1/8"), { target: { value: "5" } });
    expect(cambiar).toHaveBeenCalledWith("ANG130", 5);
    fireEvent.click(screen.getByLabelText("Quitar ANGULO 1/8"));
    expect(quitar).toHaveBeenCalledWith("ANG130");
  });

  it("con el carrito vacío invita a buscar y no muestra total", () => {
    render(<CarritoMaterial lineas={[]} onCambiarCantidad={() => {}} onQuitar={() => {}} />);
    expect(screen.getByText(/busca y agrega/i)).toBeInTheDocument();
    expect(screen.queryByText(/estimado/i)).not.toBeInTheDocument();
  });
});
