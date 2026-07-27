import { NextResponse } from "next/server";
import { actorDeMaterial } from "@/lib/materiales/actor";
import { pendientesPorSucursal } from "@/lib/inventarios/pendientes";
import { existenciasEnErp, erpConfigurado } from "@/lib/inventarios/erp";
import { evaluarPartidas, totalesDe } from "@/lib/inventarios/evaluar";
import type { PartidaEvaluada, TotalesPreview } from "@/lib/inventarios/tipos";

// FASE 1: SOLO LECTURA. Esta ruta arma el preview del folio que se generaría en
// BMS, pero no escribe nada ni en el ERP ni en Supabase. El POST que aplica de
// verdad llega en la fase 2, cuando estos números estén validados contra la
// pantalla de BMS.

export interface SucursalPreview {
  sucursal: string;
  codEstab: number | null;
  partidas: PartidaEvaluada[];
  totales: TotalesPreview;
  /** El ERP dejaría esta sucursal en existencia negativa en vez de recortar. */
  permiteNegativo: boolean;
  /** Por qué no se puede armar el folio de esta sucursal. Null = sí se puede. */
  bloqueo: string | null;
}

export async function GET() {
  const quien = await actorDeMaterial("inventarios");
  if (!quien.ok) {
    return NextResponse.json({ ok: false, error: quien.error }, { status: quien.status });
  }

  if (!erpConfigurado()) {
    return NextResponse.json(
      { ok: false, error: "El ERP no está configurado en este servidor" },
      { status: 503 },
    );
  }

  let grupos;
  try {
    grupos = await pendientesPorSucursal(quien.actor.sucursal);
  } catch (e) {
    console.error("[inventarios] No se pudieron leer los pendientes:", e);
    return NextResponse.json({ ok: false, error: "No se pudieron leer las entregas" }, { status: 500 });
  }

  // Una sucursal caída no debe tumbar las demás: cada una se resuelve por su
  // lado y la que falle se muestra bloqueada, con el resto utilizable.
  const sucursales: SucursalPreview[] = await Promise.all(
    grupos.map(async (g): Promise<SucursalPreview> => {
      if (g.codEstab === null) {
        return {
          sucursal: g.sucursal,
          codEstab: null,
          // Sin cod_estab no hay a qué establecimiento del ERP apuntar. Se
          // muestran las partidas igual para que se vea qué está esperando.
          partidas: g.partidas.map((p) => ({
            ...p,
            existencia: null,
            cantidadAplicable: 0,
            estado: "sin_catalogo" as const,
            descripcionErp: "",
            costoErp: null,
            permiteNegativo: false,
            seleccionablePorDefecto: false,
          })),
          totales: { partidas: 0, unidades: 0, costo: 0 },
          permiteNegativo: false,
          bloqueo: "Esta sucursal no tiene establecimiento del ERP asignado, avisa a sistemas",
        };
      }

      try {
        const codigos = [...new Set(g.partidas.map((p) => p.codProd))];
        const { productos, permiteNegativo } = await existenciasEnErp(codigos, g.codEstab);
        const partidas = evaluarPartidas(g.partidas, productos);
        return {
          sucursal: g.sucursal,
          codEstab: g.codEstab,
          partidas,
          totales: totalesDe(partidas.filter((p) => p.seleccionablePorDefecto)),
          permiteNegativo,
          bloqueo: null,
        };
      } catch (e) {
        console.error(`[inventarios] ERP falló para ${g.sucursal}:`, e);
        return {
          sucursal: g.sucursal,
          codEstab: g.codEstab,
          partidas: [],
          totales: { partidas: 0, unidades: 0, costo: 0 },
          permiteNegativo: false,
          bloqueo: "No se pudo consultar el inventario del ERP, intenta de nuevo",
        };
      }
    }),
  );

  return NextResponse.json({ ok: true, sucursales, soloLectura: true });
}
