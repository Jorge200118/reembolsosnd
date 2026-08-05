import { describe, it, expect, vi, beforeEach } from "vitest";

// Se intercepta la lectura a PostgREST: lo que se prueba aquí es la regla de
// qué entregas se muestran, no la consulta.
const estado = vi.hoisted(() => ({
  solicitudes: [] as unknown[],
  areas: [] as unknown[],
  consultas: [] as string[],
}));
vi.mock("@/lib/materiales/rpc", () => ({
  leerTablaMaterial: async (consulta: string) => {
    estado.consultas.push(consulta);
    return consulta.startsWith("rnd_material_entregas_area") ? estado.areas : estado.solicitudes;
  },
}));

const { armarEntregas, fichaDeSolicitud } = await import("./ficha");

function area(over: Record<string, unknown> = {}) {
  return {
    area: "FERRETERIA",
    entregado_por: "Ana Ruiz",
    fecha_entrega: "2026-07-27T11:05:00Z",
    evidencia_path: "entregas/s1/a.jpg",
    ...over,
  };
}

function solicitud(over: Record<string, unknown> = {}) {
  return {
    id: "s1", folio: "SUI-000050", sucursal: "FTE", empleado_nombre: "Juan Pérez",
    motivo: "Reparar portón", estado: "entregada",
    autorizado_por: "Gerente López", fecha_autorizacion: "2026-07-27T10:20:00Z",
    entregado_por: "Ana Ruiz", fecha_entrega: "2026-07-27T11:05:00Z",
    evidencia_path: "entregas/s1/a.jpg",
    ...over,
  };
}

describe("armarEntregas", () => {
  it("una entrega por área, en orden de entrega", () => {
    const r = armarEntregas(
      { entregado_por: "Luis", fecha_entrega: "x", evidencia_path: "entregas/s1/b.jpg" },
      [
        area({ area: "NAVE2", evidencia_path: "entregas/s1/b.jpg", fecha_entrega: "2026-07-27T13:40:00Z" }),
        area({ area: "FERRETERIA", evidencia_path: "entregas/s1/a.jpg", fecha_entrega: "2026-07-27T11:05:00Z" }),
      ],
    );
    expect(r.map((e) => e.area)).toEqual(["FERRETERIA", "NAVE2"]);
  });

  // material_entregar copia la foto de la última área a la solicitud. Si no se
  // comparara, esa foto saldría dos veces en la ficha.
  it("no duplica la foto de la solicitud cuando es copia de un área", () => {
    const r = armarEntregas(
      { entregado_por: "Ana Ruiz", fecha_entrega: "x", evidencia_path: "entregas/s1/a.jpg" },
      [area({ evidencia_path: "entregas/s1/a.jpg" })],
    );
    expect(r).toHaveLength(1);
    expect(r[0]!.area).toBe("FERRETERIA");
  });

  it("sin filas de área queda la entrega de la solicitud, sin etiqueta", () => {
    const r = armarEntregas(
      { entregado_por: "Beto", fecha_entrega: "2026-07-27T09:00:00Z", evidencia_path: "entregas/s1/z.jpg" },
      [],
    );
    expect(r).toEqual([
      { area: null, entregadoPor: "Beto", fechaEntrega: "2026-07-27T09:00:00Z", evidenciaPath: "entregas/s1/z.jpg" },
    ]);
  });

  // El caso que obliga a la regla: un encargado SIN área cierra una solicitud
  // que otras áreas ya venían surtiendo. Su foto solo vive en la solicitud, y
  // con un respaldo del tipo "si no hay filas de área" se perdería en silencio.
  it("mixto: la foto suelta de la solicitud se muestra ADEMÁS de las áreas", () => {
    const r = armarEntregas(
      { entregado_por: "Beto", fecha_entrega: "2026-07-27T14:00:00Z", evidencia_path: "entregas/s1/z.jpg" },
      [area({ evidencia_path: "entregas/s1/a.jpg" })],
    );
    expect(r).toHaveLength(2);
    expect(r[1]).toEqual({
      area: null, entregadoPor: "Beto",
      fechaEntrega: "2026-07-27T14:00:00Z", evidenciaPath: "entregas/s1/z.jpg",
    });
  });

  // Lista vacía dejaría un hueco en la pantalla, y un hueco se lee como error
  // de carga. Un renglón con evidenciaPath null deja decir "sin foto registrada".
  it("sin áreas y sin foto devuelve un renglón vacío, no una lista vacía", () => {
    const r = armarEntregas({ entregado_por: "Beto", fecha_entrega: null, evidencia_path: null }, []);
    expect(r).toHaveLength(1);
    expect(r[0]!.evidenciaPath).toBeNull();
  });
});

describe("fichaDeSolicitud", () => {
  beforeEach(() => { estado.solicitudes = []; estado.areas = []; estado.consultas = []; });

  it("arma la ficha con el autorizador y el motivo", async () => {
    estado.solicitudes = [solicitud()];
    estado.areas = [area()];
    const f = (await fichaDeSolicitud("SUI-000050"))!;
    expect(f.autorizadoPor).toBe("Gerente López");
    expect(f.motivo).toBe("Reparar portón");
    expect(f.entregas).toHaveLength(1);
  });

  it("busca las entregas por el id de la solicitud, no por el folio", async () => {
    estado.solicitudes = [solicitud({ id: "abc-123" })];
    await fichaDeSolicitud("SUI-000050");
    expect(estado.consultas.some((c) => c.includes("solicitud_id=eq.abc-123"))).toBe(true);
  });

  it("acepta el folio en minúsculas", async () => {
    estado.solicitudes = [solicitud()];
    expect(await fichaDeSolicitud("sui-000050")).not.toBeNull();
    expect(estado.consultas[0]).toContain("folio=eq.SUI-000050");
  });

  it("un folio que no existe devuelve null", async () => {
    expect(await fichaDeSolicitud("SUI-999999")).toBeNull();
  });

  // El folio viaja dentro de la URL de la consulta: no puede ser cualquier
  // cosa, y ni siquiera debe llegar a PostgREST.
  it("un folio mal formado no toca la base", async () => {
    for (const malo of ["", "SUI-1", "*", "SUI-000050&select=*", "'; drop--"]) {
      expect(await fichaDeSolicitud(malo)).toBeNull();
    }
    expect(estado.consultas).toEqual([]);
  });
});
