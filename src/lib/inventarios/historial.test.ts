import { describe, it, expect, vi, beforeEach } from "vitest";

const estado = vi.hoisted(() => ({ filas: [] as unknown[], consulta: "" }));
vi.mock("@/lib/materiales/rpc", () => ({
  leerTablaMaterial: async (consulta: string) => {
    estado.consulta = consulta;
    return estado.filas;
  },
}));

const { historialDeFolios } = await import("./historial");

function folio(over: Record<string, unknown> = {}) {
  return {
    id: "a1", folio_bms: "A700", transaccion: "40", cod_estab: 1, sucursal: "LMM",
    estado: "aplicada", partidas: 3, unidades: "5", costo_total: "120.5",
    aplicado_por: "Prueba Local", aplicado_en: "2026-08-05T10:00:00Z",
    cancelado_por: null, cancelado_en: null, motivo_cancelacion: null,
    partidas_con_diferencia: "0", folios_solicitud: "SUI-000053, SUI-000054",
    autorizadores: "Francisco Armenta",
    ...over,
  };
}

describe("historialDeFolios · autorizadores", () => {
  beforeEach(() => { estado.filas = []; estado.consulta = ""; });

  it("un solo autorizador llega como lista de uno", async () => {
    estado.filas = [folio()];
    expect((await historialDeFolios("LMM"))[0]!.autorizadores).toEqual(["Francisco Armenta"]);
  });

  // La vista los junta con '|' (migración 0042). Si esto se partiera por coma,
  // un nombre se rompería en pedazos y el segmentador ofrecería basura.
  it("varios autorizadores se parten por '|', no por coma", async () => {
    estado.filas = [folio({ autorizadores: "Francisco Armenta|Gerente López" })];
    expect((await historialDeFolios("LMM"))[0]!.autorizadores).toEqual([
      "Francisco Armenta",
      "Gerente López",
    ]);
  });

  it("sin autorizadores devuelve lista vacía y no [''], que sería una opción fantasma", async () => {
    estado.filas = [folio({ autorizadores: null })];
    expect((await historialDeFolios("LMM"))[0]!.autorizadores).toEqual([]);
    estado.filas = [folio({ autorizadores: "" })];
    expect((await historialDeFolios("LMM"))[0]!.autorizadores).toEqual([]);
  });

  it("recorta espacios alrededor de cada nombre", async () => {
    estado.filas = [folio({ autorizadores: " Francisco Armenta | Gerente López " })];
    expect((await historialDeFolios("LMM"))[0]!.autorizadores).toEqual([
      "Francisco Armenta",
      "Gerente López",
    ]);
  });
});
