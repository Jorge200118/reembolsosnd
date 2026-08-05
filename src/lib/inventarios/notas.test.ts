import { describe, it, expect } from "vitest";
import { notasParaBms } from "./notas";

const MAX = 400;

function partida(folio: string, motivo: string) {
  return { folioSolicitud: folio, motivo };
}

describe("notasParaBms", () => {
  it("junta los motivos de varias solicitudes", () => {
    expect(
      notasParaBms([
        partida("SUI-000050", "Reparar portón"),
        partida("SUI-000051", "Cambio de tubería"),
      ]),
    ).toBe("Reparar portón · Cambio de tubería");
  });

  // Un folio trae varias partidas de la misma solicitud y todas comparten
  // motivo. Sin agrupar, el texto saldría repetido por cada producto.
  it("no repite el motivo cuando la solicitud trae varias partidas", () => {
    expect(
      notasParaBms([
        partida("SUI-000050", "Reparar portón"),
        partida("SUI-000050", "Reparar portón"),
        partida("SUI-000050", "Reparar portón"),
      ]),
    ).toBe("Reparar portón");
  });

  // Dos solicitudes distintas pueden traer el mismo texto; son dos motivos.
  it("dos solicitudes con el mismo texto salen las dos", () => {
    expect(
      notasParaBms([partida("SUI-000050", "Mantenimiento"), partida("SUI-000051", "Mantenimiento")]),
    ).toBe("Mantenimiento · Mantenimiento");
  });

  it("aplana los saltos de línea: el campo de BMS es de un solo renglón", () => {
    expect(notasParaBms([partida("SUI-000050", "  Reparar\n  el portón  ")])).toBe("Reparar el portón");
  });

  it("sin motivos devuelve cadena vacía, no revienta", () => {
    expect(notasParaBms([])).toBe("");
    expect(notasParaBms([partida("SUI-000050", "   ")])).toBe("");
  });

  // Lo importante de todo el archivo: la columna es varchar(400) y un INSERT
  // que se pasa tumbaría un folio que YA movió inventario.
  it("nunca se pasa de 400 caracteres", () => {
    const muchos = Array.from({ length: 40 }, (_, i) =>
      partida(`SUI-${String(i).padStart(6, "0")}`, `Motivo número ${i} con texto de relleno para ocupar espacio`),
    );
    const r = notasParaBms(muchos);
    expect(r.length).toBeLessThanOrEqual(MAX);
    expect(r).toMatch(/… \+\d+ más$/);
  });

  it("dice cuántos motivos no cupieron", () => {
    const largo = "x".repeat(190);
    const r = notasParaBms([
      partida("A-000001", largo),
      partida("B-000002", largo),
      partida("C-000003", largo),
      partida("D-000004", largo),
    ]);
    expect(r.length).toBeLessThanOrEqual(MAX);
    expect(r.endsWith("… +2 más")).toBe(true);
  });

  it("un solo motivo más largo que el campo se corta, no se pierde", () => {
    const r = notasParaBms([partida("SUI-000050", "y".repeat(900))]);
    expect(r.length).toBeLessThanOrEqual(MAX);
    expect(r.startsWith("yyy")).toBe(true);
  });

  // El caso feo: el primero no cabe y además hay más esperando.
  it("primero gigante con otros detrás: corta y avisa", () => {
    const r = notasParaBms([
      partida("SUI-000050", "z".repeat(900)),
      partida("SUI-000051", "corto"),
      partida("SUI-000052", "corto"),
    ]);
    expect(r.length).toBeLessThanOrEqual(MAX);
    expect(r.endsWith("… +2 más")).toBe(true);
  });

  it("lo que cabe justo no se corta ni gana cola", () => {
    const r = notasParaBms([partida("SUI-000050", "a".repeat(MAX))]);
    expect(r).toBe("a".repeat(MAX));
  });
});
