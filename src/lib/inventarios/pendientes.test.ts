import { describe, it, expect, vi, beforeEach } from "vitest";

// Se intercepta la lectura a PostgREST para probar el agrupado, que es donde
// vive la lógica; la consulta en sí la cubre la prueba de humo contra Supabase.
const estado = vi.hoisted(() => ({ filas: [] as unknown[], consulta: "" }));
vi.mock("@/lib/materiales/rpc", () => ({
  leerTablaMaterial: async (consulta: string) => {
    estado.consulta = consulta;
    return estado.filas;
  },
}));

const { pendientesPorSucursal } = await import("./pendientes");

function fila(over: Record<string, unknown> = {}) {
  return {
    linea_id: "l1", solicitud_id: "s1", folio_solicitud: "SUI-000001",
    sucursal: "LMM", cod_estab: 1, empleado_nombre: "Juan",
    fecha_entrega: "2026-07-27T10:00:00Z", area: null,
    cod_prod: "TRU12592", descripcion: "CINTA", unidad: "PZ",
    cantidad: "3", costo_unitario: "30.79",
    ...over,
  };
}

describe("pendientesPorSucursal", () => {
  beforeEach(() => { estado.filas = []; estado.consulta = ""; });

  it("filtra por sucursal cuando el actor tiene una", async () => {
    await pendientesPorSucursal("FTE");
    expect(estado.consulta).toContain("sucursal=eq.FTE");
  });

  it("no filtra cuando el actor es admin ('*')", async () => {
    await pendientesPorSucursal("*");
    expect(estado.consulta).not.toContain("sucursal=eq.");
  });

  it("agrupa por sucursal conservando el cod_estab", async () => {
    estado.filas = [
      fila({ linea_id: "a", sucursal: "LMM", cod_estab: 1 }),
      fila({ linea_id: "b", sucursal: "FTE", cod_estab: 3 }),
      fila({ linea_id: "c", sucursal: "LMM", cod_estab: 1 }),
    ];
    const r = await pendientesPorSucursal("*");
    expect(r.map((g) => g.sucursal)).toEqual(["FTE", "LMM"]); // orden alfabético
    expect(r.find((g) => g.sucursal === "LMM")!.partidas).toHaveLength(2);
    expect(r.find((g) => g.sucursal === "FTE")!.codEstab).toBe(3);
  });

  // PostgREST entrega numeric como string. Sumarlos sin convertir daría
  // "3" + "2" = "32" en los totales.
  it("convierte a número lo que PostgREST manda como texto", async () => {
    estado.filas = [fila({ cantidad: "3", costo_unitario: "30.79" })];
    const p = (await pendientesPorSucursal("*"))[0]!.partidas[0]!;
    expect(p.cantidad).toBe(3);
    expect(p.costoUnitario).toBe(30.79);
  });

  it("costo nulo se queda en null, no en cero", async () => {
    estado.filas = [fila({ costo_unitario: null })];
    expect((await pendientesPorSucursal("*"))[0]!.partidas[0]!.costoUnitario).toBeNull();
  });

  it("normaliza el código para que empate con el ERP", async () => {
    estado.filas = [fila({ cod_prod: "  tru12592 " })];
    expect((await pendientesPorSucursal("*"))[0]!.partidas[0]!.codProd).toBe("TRU12592");
  });

  it("una sucursal sin cod_estab se agrupa igual, con codEstab null", async () => {
    estado.filas = [fila({ cod_estab: null, sucursal: "TIJ" })];
    const g = (await pendientesPorSucursal("*"))[0]!;
    expect(g.codEstab).toBeNull();
    expect(g.partidas).toHaveLength(1);
  });

  it("sin pendientes devuelve lista vacía, no revienta", async () => {
    expect(await pendientesPorSucursal("LMM")).toEqual([]);
  });
});
