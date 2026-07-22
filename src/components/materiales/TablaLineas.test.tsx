import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { TablaLineas } from "./TablaLineas";
import type { LineaGuardada } from "@/lib/materiales/totales";

// Este proyecto no activa `test.globals` en vitest.config.ts, así que el
// auto-cleanup de @testing-library/react (que depende de un `afterEach`
// global) no se dispara solo. Sin esto, el DOM de un test se filtra al
// siguiente. Mismo patrón que AvisosCard.test.tsx / CarritoMaterial.test.tsx.
afterEach(() => {
  cleanup();
});

const LINEAS: LineaGuardada[] = [
  { id: "l1", orden: 0, cod_prod: "ANG130", descripcion: "ANGULO 1/8", unidad: "PZ", cantidad: 2, costo_unitario: 180.5, existencia_al_pedir: 40, cantidad_entregada: null },
  { id: "l2", orden: 1, cod_prod: "TOR001", descripcion: "TORNILLO 1/4", unidad: "PZ", cantidad: 10, costo_unitario: null, existencia_al_pedir: 3, cantidad_entregada: null },
];

describe("TablaLineas", () => {
  it("en modo lectura muestra los materiales sin campos de captura", () => {
    render(<TablaLineas lineas={LINEAS} capturable={false} entregas={{}} onCambiar={() => {}} />);
    expect(screen.getByText("ANGULO 1/8")).toBeInTheDocument();
    expect(screen.getByText("TORNILLO 1/4")).toBeInTheDocument();
    expect(screen.queryByLabelText(/entregado de/i)).not.toBeInTheDocument();
  });

  it("marca en la existencia las líneas que no alcanzan", () => {
    render(<TablaLineas lineas={LINEAS} capturable={false} entregas={{}} onCambiar={() => {}} />);
    // TORNILLO: se piden 10 y hay 3 -> la celda de existencia se marca
    expect(screen.getByTitle("Se pidieron 10 y solo había 3")).toBeInTheDocument();
  });

  // El ERP tiene existencias negativas reales (al probar el puente, 3 de 25
  // materiales venían en negativo). Aquí SÍ se enseña el número crudo, a
  // diferencia de la PWA: al gerente y a almacén un -3 les dice que el ERP
  // está sobrevendido, y eso es información útil, no ruido.
  it("con existencia negativa lo dice como agotado pero conserva el número", () => {
    const enNegativo: LineaGuardada[] = [{ ...LINEAS[0]!, cantidad: 2, existencia_al_pedir: -3 }];
    render(<TablaLineas lineas={enNegativo} capturable={false} entregas={{}} onCambiar={() => {}} />);
    expect(screen.getByTitle("No había existencia (el ERP marcaba -3)")).toBeInTheDocument();
    expect(screen.getByText("-3")).toBeInTheDocument();
  });

  it("en modo captura muestra un campo por línea y avisa los cambios", () => {
    const cambiar = vi.fn();
    render(<TablaLineas lineas={LINEAS} capturable entregas={{ l1: 2, l2: 10 }} onCambiar={cambiar} />);
    const campo = screen.getByLabelText("Entregado de ANGULO 1/8");
    expect(campo).toHaveValue(2);
    fireEvent.change(campo, { target: { value: "1" } });
    expect(cambiar).toHaveBeenCalledWith("l1", 1);
  });

  it("cuando ya se entregó, muestra lo entregado en vez de campos", () => {
    const entregadas: LineaGuardada[] = [{ ...LINEAS[0]!, cantidad_entregada: 1 }];
    render(<TablaLineas lineas={entregadas} capturable={false} entregas={{}} onCambiar={() => {}} />);
    expect(screen.getByText("1 de 2")).toBeInTheDocument();
  });
});
