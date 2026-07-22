import { describe, it, expect } from "vitest";
import { agregarMaterial, cambiarCantidad, quitarMaterial, totalEstimado } from "./carrito";
import type { Material, LineaSolicitud } from "./tipos";

const ANGULO: Material = {
  codProd: "ANG130", descripcion: "ANGULO 1/8 X 1 1/4", unidad: "PZ", existencia: 40, costo: 180.5,
};
const TORNILLO: Material = {
  codProd: "TOR001", descripcion: "TORNILLO 1/4", unidad: "PZ", existencia: null, costo: null,
};

describe("carrito de materiales", () => {
  it("agrega un material congelando su costo y existencia del momento", () => {
    const r = agregarMaterial([], ANGULO, 2);
    expect(r).toEqual<LineaSolicitud[]>([
      {
        codProd: "ANG130",
        descripcion: "ANGULO 1/8 X 1 1/4",
        unidad: "PZ",
        cantidad: 2,
        costoUnitario: 180.5,
        existenciaAlPedir: 40,
      },
    ]);
  });

  it("agregar dos veces el mismo material suma cantidades, no duplica renglones", () => {
    const r = agregarMaterial(agregarMaterial([], ANGULO, 2), ANGULO, 3);
    expect(r).toHaveLength(1);
    expect(r[0]!.cantidad).toBe(5);
  });

  it("ignora cantidades no positivas al agregar", () => {
    expect(agregarMaterial([], ANGULO, 0)).toEqual([]);
    expect(agregarMaterial([], ANGULO, -1)).toEqual([]);
    expect(agregarMaterial([], ANGULO, Number.NaN)).toEqual([]);
  });

  it("cambiar la cantidad a cero o menos quita el renglón", () => {
    const con2 = agregarMaterial([], ANGULO, 2);
    expect(cambiarCantidad(con2, "ANG130", 7)[0]!.cantidad).toBe(7);
    expect(cambiarCantidad(con2, "ANG130", 0)).toEqual([]);
    expect(cambiarCantidad(con2, "ANG130", -3)).toEqual([]);
  });

  it("quitar un material que no está no altera el carrito", () => {
    const con2 = agregarMaterial([], ANGULO, 2);
    expect(quitarMaterial(con2, "NOEXISTE")).toEqual(con2);
    expect(quitarMaterial(con2, "ANG130")).toEqual([]);
  });

  it("el total suma cantidad x costo y trata el costo desconocido como cero", () => {
    const carrito = agregarMaterial(agregarMaterial([], ANGULO, 2), TORNILLO, 10);
    expect(totalEstimado(carrito)).toBe(361);
    expect(totalEstimado([])).toBe(0);
  });

  it("no muta el arreglo que recibe", () => {
    const original = agregarMaterial([], ANGULO, 2);
    const copia = JSON.parse(JSON.stringify(original));
    agregarMaterial(original, TORNILLO, 1);
    cambiarCantidad(original, "ANG130", 9);
    quitarMaterial(original, "ANG130");
    expect(original).toEqual(copia);
  });
});
