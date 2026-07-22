import { describe, it, expect, vi } from "vitest";
import { confirmarConElErp } from "./confirmar";
import type { Material } from "./tipos";

const CAJA: Material = {
  codProd: "TRU47364",
  descripcion: 'CAJA CON 100 TAQUETES EXPANSIVOS DE 1/4" SIN TORNILLO,FIERO',
  unidad: "CJ",
  existencia: 5,
  costo: 387.74,
};
const BOLSA: Material = {
  codProd: "TRU47373",
  descripcion: 'BOLSA CON 4 TAQUETES EXPANSIVOS DE 3/16" SIN TORNILLO,FIERO',
  unidad: "PZ",
  existencia: 24,
  costo: 12.0496,
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
