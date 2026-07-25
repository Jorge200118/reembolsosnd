import { describe, it, expect } from "vitest";
import { AREAS, areaDeZona, esArea, etiquetaArea, type Area } from "./areas";

describe("areaDeZona", () => {
  it("manda el patio N0 a NAVE1", () => {
    expect(areaDeZona("N0 PATIO")).toBe("NAVE1");
  });

  it("deriva las naves por el prefijo del nombre", () => {
    expect(areaDeZona("N1 P1 DER")).toBe("NAVE1");
    expect(areaDeZona("N1 P2 IZQ")).toBe("NAVE1");
    expect(areaDeZona("N2 DER")).toBe("NAVE2");
    expect(areaDeZona("N2 PISO")).toBe("NAVE2");
    expect(areaDeZona("N3 LINEAL")).toBe("NAVE3");
  });

  it("todo lo que no es nave cae en ferretería", () => {
    expect(areaDeZona("PASILLO FERR IZQ")).toBe("FERRETERIA");
    expect(areaDeZona("ELECTRICIDAD")).toBe("FERRETERIA");
    expect(areaDeZona("CHAPAS")).toBe("FERRETERIA");
    expect(areaDeZona("BODEGA PATIO")).toBe("FERRETERIA");
  });

  // El nombre real de la zona en Mochis trae doble espacio: "N1 P3  IZQ".
  it("tolera espacios de sobra y minúsculas", () => {
    expect(areaDeZona("  n1 p3  izq ")).toBe("NAVE1");
  });

  // Sin zona no hay área: quien llame decide qué hacer, pero no se inventa.
  it("devuelve null cuando no hay zona", () => {
    expect(areaDeZona("")).toBeNull();
    expect(areaDeZona(null)).toBeNull();
    expect(areaDeZona(undefined)).toBeNull();
    expect(areaDeZona("   ")).toBeNull();
  });

  // "NAVEGACION" empieza con N pero no es una nave: el dígito es obligatorio.
  it("no confunde palabras que empiezan con N", () => {
    expect(areaDeZona("NAVEGACION")).toBe("FERRETERIA");
    expect(areaDeZona("NORTE")).toBe("FERRETERIA");
  });

  it("N4 en adelante no existe todavía, cae en ferretería", () => {
    expect(areaDeZona("N4 ALGO")).toBe("FERRETERIA");
  });
});

describe("esArea", () => {
  it("acepta las cuatro áreas", () => {
    expect(esArea("FERRETERIA")).toBe(true);
    expect(esArea("NAVE1")).toBe(true);
    expect(esArea("NAVE2")).toBe(true);
    expect(esArea("NAVE3")).toBe(true);
  });

  it("rechaza cualquier otra cosa", () => {
    expect(esArea("PATIO")).toBe(false);
    expect(esArea("")).toBe(false);
    expect(esArea(null)).toBe(false);
    expect(esArea(undefined)).toBe(false);
    expect(esArea("nave1")).toBe(false);
  });
});

describe("etiquetaArea", () => {
  it("da nombres legibles para la pantalla", () => {
    expect(etiquetaArea("FERRETERIA")).toBe("Ferretería");
    expect(etiquetaArea("NAVE1")).toBe("Nave 1");
    expect(etiquetaArea("NAVE2")).toBe("Nave 2");
    expect(etiquetaArea("NAVE3")).toBe("Nave 3");
  });
});

describe("AREAS", () => {
  it("son exactamente cuatro y ferretería va primero", () => {
    expect(AREAS).toEqual(["FERRETERIA", "NAVE1", "NAVE2", "NAVE3"]);
  });

  it("toda área tiene etiqueta", () => {
    for (const a of AREAS) {
      expect(etiquetaArea(a as Area).length).toBeGreaterThan(0);
    }
  });
});
