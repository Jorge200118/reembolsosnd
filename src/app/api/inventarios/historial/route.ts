import { NextResponse } from "next/server";
import { actorDeMaterial } from "@/lib/materiales/actor";
import { historialDeFolios, partidasDeFolio } from "@/lib/inventarios/historial";

// GET /api/inventarios/historial          -> folios de la sucursal del actor
// GET /api/inventarios/historial?id=<uuid> -> partidas de ese folio
//
// Solo lectura. El detalle se pide aparte y no de golpe con la lista, porque en
// la práctica se abre uno o dos folios, no los cien.

export async function GET(req: Request) {
  const quien = await actorDeMaterial("inventarios");
  if (!quien.ok) return NextResponse.json({ ok: false, error: quien.error }, { status: quien.status });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  try {
    if (id) {
      const partidas = await partidasDeFolio(id);
      return NextResponse.json({ ok: true, partidas });
    }
    const folios = await historialDeFolios(quien.actor.sucursal);
    return NextResponse.json({ ok: true, folios });
  } catch (e) {
    console.error("[inventarios] No se pudo leer el historial:", e);
    return NextResponse.json({ ok: false, error: "No se pudo leer el historial" }, { status: 500 });
  }
}
