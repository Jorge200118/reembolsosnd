import { describe, it, expect } from "vitest";
import {
  filtrar,
  opcionesDe,
  alternar,
  hayFiltros,
  normalizar,
  diaLocal,
  SIN_FILTROS,
  type ConfigSegmentos,
  type EstadoSegmentos,
} from "./segmentar";

interface Fila {
  folio: string;
  sucursal: string;
  estado: string;
  areas: string[];
  texto: string;
  fecha: string | null;
}

function fila(over: Partial<Fila> = {}): Fila {
  return {
    folio: "SUI-000001",
    sucursal: "LMM",
    estado: "ok",
    areas: ["FERRETERIA"],
    texto: "cinta masking",
    fecha: "2026-07-27T15:00:00Z",
    ...over,
  };
}

const CONFIG: ConfigSegmentos<Fila> = {
  segmentos: [
    { id: "sucursal", etiqueta: "Sucursal", de: (f) => f.sucursal },
    { id: "estado", etiqueta: "Estado", de: (f) => f.estado, orden: ["ok", "espera"] },
    { id: "area", etiqueta: "Área", de: (f) => f.areas },
  ],
  buscarEn: (f) => `${f.folio} ${f.texto}`,
  fechaDe: (f) => f.fecha,
};

function estado(over: Partial<EstadoSegmentos> = {}): EstadoSegmentos {
  return { ...SIN_FILTROS, ...over };
}

describe("normalizar", () => {
  it("quita acentos para que 'porton' encuentre 'portón'", () => {
    expect(normalizar("Portón")).toBe("porton");
    expect(normalizar("  FERRETERÍA ")).toBe("ferreteria");
  });
});

describe("diaLocal", () => {
  it("usa el día local y no el de UTC", () => {
    // 2026-07-28T02:00Z es todavía el 27 por la tarde en Sinaloa (UTC-7).
    // Con slice(0,10) del ISO diría 28 y quien filtrara "el 27" no la vería.
    const iso = "2026-07-28T02:00:00Z";
    const esperado = new Date(iso);
    const dia = `${esperado.getFullYear()}-${String(esperado.getMonth() + 1).padStart(2, "0")}-${String(esperado.getDate()).padStart(2, "0")}`;
    expect(diaLocal(iso)).toBe(dia);
  });

  it("null y basura no revientan", () => {
    expect(diaLocal(null)).toBeNull();
    expect(diaLocal("no es fecha")).toBeNull();
  });
});

describe("filtrar", () => {
  const datos = [
    fila({ folio: "A", sucursal: "LMM", estado: "ok" }),
    fila({ folio: "B", sucursal: "FTE", estado: "ok" }),
    fila({ folio: "C", sucursal: "LMM", estado: "espera" }),
  ];

  // Lo más importante: un segmento vacío NO es "no mostrar nada".
  it("sin nada marcado devuelve todo", () => {
    expect(filtrar(datos, CONFIG, estado())).toHaveLength(3);
  });

  it("varias opciones del mismo segmento son un O", () => {
    const r = filtrar(datos, CONFIG, estado({ seleccion: { sucursal: ["LMM", "FTE"] } }));
    expect(r).toHaveLength(3);
  });

  it("segmentos distintos son un Y", () => {
    const r = filtrar(datos, CONFIG, estado({ seleccion: { sucursal: ["LMM"], estado: ["ok"] } }));
    expect(r.map((f) => f.folio)).toEqual(["A"]);
  });

  // Una solicitud toca varias áreas; filtrar por una tiene que encontrarla.
  it("una dimensión multivaluada casa con cualquiera de sus valores", () => {
    const mixta = [fila({ folio: "M", areas: ["FERRETERIA", "NAVE2"] })];
    expect(filtrar(mixta, CONFIG, estado({ seleccion: { area: ["NAVE2"] } }))).toHaveLength(1);
    expect(filtrar(mixta, CONFIG, estado({ seleccion: { area: ["NAVE3"] } }))).toHaveLength(0);
  });

  it("la búsqueda ignora acentos y mayúsculas", () => {
    const d = [fila({ folio: "X", texto: "Pintar el portón" })];
    expect(filtrar(d, CONFIG, estado({ texto: "PORTON" }))).toHaveLength(1);
    expect(filtrar(d, CONFIG, estado({ texto: "tornillo" }))).toHaveLength(0);
  });

  // Encontrado probando en pantalla: "aerosol azul" no hallaba "PINTURA EN
  // AEROSOL, AZUL NEON" porque se buscaba la frase completa. Nadie teclea las
  // palabras en el orden en que están en el catálogo del ERP.
  it("busca palabra por palabra, en cualquier orden", () => {
    const d = [fila({ texto: "PINTURA EN AEROSOL, AZUL NEON, BOTE ESBELTO, 400 ML" })];
    expect(filtrar(d, CONFIG, estado({ texto: "aerosol azul" }))).toHaveLength(1);
    expect(filtrar(d, CONFIG, estado({ texto: "azul aerosol" }))).toHaveLength(1);
    expect(filtrar(d, CONFIG, estado({ texto: "  aerosol   azul  " }))).toHaveLength(1);
    // Todas las palabras tienen que estar: es un Y, no un O.
    expect(filtrar(d, CONFIG, estado({ texto: "aerosol verde" }))).toHaveLength(0);
  });

  it("el rango de fechas incluye los extremos", () => {
    const hoy = diaLocal("2026-07-27T15:00:00Z")!;
    expect(filtrar([fila()], CONFIG, estado({ desde: hoy, hasta: hoy }))).toHaveLength(1);
  });

  // Si pediste un rango, algo sin fecha no se puede afirmar que esté dentro.
  it("un item sin fecha se cae del rango, pero no si no hay rango", () => {
    const sinFecha = [fila({ fecha: null })];
    expect(filtrar(sinFecha, CONFIG, estado())).toHaveLength(1);
    expect(filtrar(sinFecha, CONFIG, estado({ desde: "2026-01-01" }))).toHaveLength(0);
  });
});

describe("opcionesDe", () => {
  const datos = [
    fila({ folio: "A", sucursal: "LMM", estado: "ok" }),
    fila({ folio: "B", sucursal: "FTE", estado: "ok" }),
    fila({ folio: "C", sucursal: "LMM", estado: "espera" }),
  ];

  it("cuenta cuántos caen en cada opción", () => {
    const o = opcionesDe(datos, CONFIG, estado(), "sucursal");
    expect(o.find((x) => x.valor === "LMM")!.cuantos).toBe(2);
    expect(o.find((x) => x.valor === "FTE")!.cuantos).toBe(1);
  });

  // Si el conteo se filtrara a sí mismo, marcar LMM dejaría FTE en 0 y
  // parecería que ya no existe.
  it("el propio segmento no se filtra a sí mismo", () => {
    const o = opcionesDe(datos, CONFIG, estado({ seleccion: { sucursal: ["LMM"] } }), "sucursal");
    expect(o.find((x) => x.valor === "FTE")!.cuantos).toBe(1);
  });

  it("los demás segmentos sí acotan el conteo", () => {
    const o = opcionesDe(datos, CONFIG, estado({ seleccion: { estado: ["espera"] } }), "sucursal");
    expect(o.find((x) => x.valor === "LMM")!.cuantos).toBe(1);
    expect(o.find((x) => x.valor === "FTE")!.cuantos).toBe(0);
  });

  // Si desapareciera, no habría forma de volver a ella sin limpiar todo.
  it("una opción en cero se sigue mostrando", () => {
    const o = opcionesDe(datos, CONFIG, estado({ seleccion: { estado: ["espera"] } }), "sucursal");
    expect(o.map((x) => x.valor).sort()).toEqual(["FTE", "LMM"]);
  });

  it("respeta el orden declarado y alfabetiza el resto", () => {
    const d = [...datos, fila({ folio: "D", estado: "zzz" })];
    expect(opcionesDe(d, CONFIG, estado(), "estado").map((x) => x.valor)).toEqual(["ok", "espera", "zzz"]);
  });
});

describe("alternar y hayFiltros", () => {
  it("marca y desmarca", () => {
    const a = alternar(SIN_FILTROS, "sucursal", "LMM");
    expect(a.seleccion.sucursal).toEqual(["LMM"]);
    expect(alternar(a, "sucursal", "LMM").seleccion.sucursal).toEqual([]);
  });

  it("hayFiltros distingue limpio de sucio", () => {
    expect(hayFiltros(SIN_FILTROS)).toBe(false);
    expect(hayFiltros(alternar(SIN_FILTROS, "sucursal", "LMM"))).toBe(true);
    expect(hayFiltros({ ...SIN_FILTROS, texto: "x" })).toBe(true);
    expect(hayFiltros({ ...SIN_FILTROS, desde: "2026-01-01" })).toBe(true);
    // Marcar y desmarcar deja una lista vacía, que no cuenta como filtro.
    expect(hayFiltros(alternar(alternar(SIN_FILTROS, "s", "v"), "s", "v"))).toBe(false);
  });
});
