import { describe, it, expect } from "vitest";
import { empleadosPorSucursal } from "./empleadosPorSucursal";
import { supabase } from "@/lib/supabase/client";

// Integración contra la base real (igual que empleados.test.ts): lo que se prueba
// es que el mapeo abreviatura -> nombre largo salga de `sucursales_map` y no de
// una copia hardcodeada que se desincroniza sin avisar.
describe("empleadosPorSucursal", () => {
  it("sin código devuelve vacío", async () => {
    expect(await empleadosPorSucursal(null)).toEqual([]);
  });

  it("un código que no está en sucursales_map devuelve vacío", async () => {
    expect(await empleadosPorSucursal("XXX")).toEqual([]);
  });

  it("resuelve TODAS las abreviaturas del catálogo, no solo las hardcodeadas", async () => {
    const { data: catalogo, error } = await supabase
      .from("sucursales_map")
      .select("abrev, nombre_largo");
    if (error) throw error;
    expect(catalogo && catalogo.length).toBeGreaterThan(0);

    // Cada abreviatura del catálogo debe traer empleados de SU nombre largo.
    // Si alguien agrega una sucursal a la tabla, este test la cubre solo.
    let total = 0;
    for (const fila of catalogo ?? []) {
      const empleados = await empleadosPorSucursal(fila.abrev as string);
      total += empleados.length;
      for (const e of empleados) {
        expect(e.sucursal).toBe(fila.nombre_largo);
      }
    }
    // Sin esto el test pasaría igual si TODAS las sucursales devolvieran vacío,
    // que es justo la forma en que se rompe un mapeo mal resuelto.
    expect(total).toBeGreaterThan(0);
  });

  it("acepta el código en minúsculas o con espacios", async () => {
    const limpio = await empleadosPorSucursal("FTE");
    const sucio = await empleadosPorSucursal("  fte ");
    expect(sucio.map((e) => e.id)).toEqual(limpio.map((e) => e.id));
  });
});
