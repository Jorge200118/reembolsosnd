import { describe, it, expect, vi } from "vitest";
import { confirmarConElErp } from "./confirmar";
import type { Material } from "./tipos";

const CAJA: Material = {
  codProd: "TRU47364",
  descripcion: 'CAJA CON 100 TAQUETES EXPANSIVOS DE 1/4" SIN TORNILLO,FIERO',
  unidad: "CJ",
  existencia: 5,
  costo: 387.74,
  area: "FERRETERIA",
};
const BOLSA: Material = {
  codProd: "TRU47373",
  descripcion: 'BOLSA CON 4 TAQUETES EXPANSIVOS DE 3/16" SIN TORNILLO,FIERO',
  unidad: "PZ",
  existencia: 24,
  costo: 12.0496,
  area: "FERRETERIA",
};

/** ERP de mentiras: devuelve lo que coincida parcialmente, como el de verdad. */
function erpFalso(catalogo: Material[]) {
  return vi.fn(async (q: string) =>
    catalogo.filter((m) => m.codProd.toUpperCase().includes(q.toUpperCase())),
  );
}

describe("confirmarConElErp", () => {
  it("arma la línea con el costo del ERP, no con el que llegue", async () => {
    const r = await confirmarConElErp([{ codProd: "TRU47364", cantidad: 2 }], erpFalso([CAJA]));
    expect(r).toEqual({
      ok: true,
      lineas: [
        {
          cod_prod: "TRU47364",
          descripcion: CAJA.descripcion,
          unidad: "CJ",
          cantidad: 2,
          costo_unitario: 387.74,
          existencia_al_pedir: 5,
          area: "FERRETERIA",
        },
      ],
    });
  });

  // El agujero que esto cierra: el teléfono mandaba costo y descripción y se
  // guardaban tal cual, así que el gerente autorizaba viendo un total falso.
  it("ignora cualquier costo o descripción que venga del cliente", async () => {
    const conBasura = [{ codProd: "TRU47364", cantidad: 2, costoUnitario: 5, descripcion: "Un clavito" }];
    const r = await confirmarConElErp(conBasura, erpFalso([CAJA]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lineas[0]!.costo_unitario).toBe(387.74);
    expect(r.lineas[0]!.descripcion).toBe(CAJA.descripcion);
  });

  it("respeta el orden del carrito y consulta una sola vez por código repetido", async () => {
    const buscar = erpFalso([CAJA, BOLSA]);
    const r = await confirmarConElErp(
      [
        { codProd: "TRU47373", cantidad: 1 },
        { codProd: "TRU47364", cantidad: 3 },
        { codProd: "TRU47373", cantidad: 2 },
      ],
      buscar,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lineas.map((l) => `${l.cod_prod}x${l.cantidad}`)).toEqual([
      "TRU47373x1",
      "TRU47364x3",
      "TRU47373x2",
    ]);
    expect(buscar).toHaveBeenCalledTimes(2);
  });

  it("rechaza un código que ya no existe en el catálogo", async () => {
    const r = await confirmarConElErp([{ codProd: "NOEXISTE9", cantidad: 1 }], erpFalso([CAJA]));
    expect(r).toMatchObject({ ok: false });
    if (r.ok) return;
    expect(r.error).toContain("NOEXISTE9");
  });

  // El ERP busca por coincidencia parcial: pedir TRU4736 traería varios.
  it("solo acepta la coincidencia exacta, no un pariente del código", async () => {
    const r = await confirmarConElErp([{ codProd: "TRU4736", cantidad: 1 }], erpFalso([CAJA]));
    expect(r).toMatchObject({ ok: false });
  });

  it("acepta el código en minúsculas o con espacios", async () => {
    const r = await confirmarConElErp([{ codProd: "  tru47364 ", cantidad: 1 }], erpFalso([CAJA]));
    expect(r).toMatchObject({ ok: true });
    if (!r.ok) return;
    expect(r.lineas[0]!.cod_prod).toBe("TRU47364");
  });

  it("conserva el null del ERP: sin dato no es lo mismo que cero", async () => {
    const sinDatos: Material = { ...CAJA, existencia: null, costo: null };
    const r = await confirmarConElErp([{ codProd: "TRU47364", cantidad: 1 }], erpFalso([sinDatos]));
    expect(r).toMatchObject({ ok: true });
    if (!r.ok) return;
    expect(r.lineas[0]!.costo_unitario).toBeNull();
    expect(r.lineas[0]!.existencia_al_pedir).toBeNull();
  });

  it("rechaza cantidades inválidas y carritos vacíos sin llamar al ERP", async () => {
    const buscar = erpFalso([CAJA]);
    expect(await confirmarConElErp([], buscar)).toMatchObject({ ok: false });
    expect(await confirmarConElErp([{ codProd: "TRU47364", cantidad: 0 }], buscar)).toMatchObject({ ok: false });
    expect(await confirmarConElErp([{ codProd: "", cantidad: 1 }], buscar)).toMatchObject({ ok: false });
    expect(buscar).not.toHaveBeenCalled();
  });
});

describe("confirmarConElErp — área", () => {
  const conArea = (over: Partial<Material> = {}): Material => ({
    codProd: "FER001",
    descripcion: 'PIJA 2"',
    unidad: "PZ",
    existencia: 100,
    costo: 3,
    area: "FERRETERIA",
    ...over,
  });

  it("congela el área en la línea confirmada", async () => {
    const buscar = async () => [conArea({ codProd: "VAR001", area: "NAVE2" })];
    const r = await confirmarConElErp([{ codProd: "VAR001", cantidad: 2 }], buscar);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.lineas[0]!.area).toBe("NAVE2");
  });

  it("rechaza un material sin área y lo nombra", async () => {
    const buscar = async () => [conArea({ codProd: "PRI010", descripcion: "KITOX BLANCO", area: null })];
    const r = await confirmarConElErp([{ codProd: "PRI010", cantidad: 1 }], buscar);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("PRI010");
      expect(r.error).toContain("no tiene área");
    }
  });

  // Si el área la mandara el cliente podría elegir quién le entrega. Solo cuenta
  // lo que dice el ERP.
  it("ignora el área que venga del carrito y usa la del ERP", async () => {
    const buscar = async () => [conArea({ codProd: "FER001", area: "FERRETERIA" })];
    const pedidas = [{ codProd: "FER001", cantidad: 1, area: "NAVE3" } as never];
    const r = await confirmarConElErp(pedidas, buscar);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.lineas[0]!.area).toBe("FERRETERIA");
  });

  it("nombra todos los materiales sin área, no solo el primero", async () => {
    const buscar = async (q: string) => [conArea({ codProd: q, area: null })];
    const r = await confirmarConElErp(
      [{ codProd: "PRI010", cantidad: 1 }, { codProd: "TRU123", cantidad: 1 }],
      buscar,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("PRI010");
      expect(r.error).toContain("TRU123");
    }
  });
});
