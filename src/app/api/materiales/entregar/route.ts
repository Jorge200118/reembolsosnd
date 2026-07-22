import { NextResponse } from "next/server";
import { llamarRpcMaterial } from "@/lib/materiales/rpc";
import { avisarEmpleado } from "@/lib/materiales/avisar";
import { actorDeMaterial } from "@/lib/materiales/actor";

// Quién entrega y sobre qué sucursal salen de la cookie firmada, no del body.

interface EntregaEntrante {
  lineaId?: unknown;
  cantidadEntregada?: unknown;
}

export async function POST(req: Request) {
  const quien = await actorDeMaterial("materiales-almacen");
  if (!quien.ok) return NextResponse.json({ ok: false, error: quien.error }, { status: quien.status });

  const { id, entregas, codigo, evidenciaPath } = (await req.json().catch(() => ({}))) as {
    id?: unknown; entregas?: unknown; codigo?: unknown; evidenciaPath?: unknown;
  };
  if (typeof id !== "string" || !id) {
    return NextResponse.json({ ok: false, error: "Falta la solicitud" }, { status: 400 });
  }

  const lista = Array.isArray(entregas) ? (entregas as EntregaEntrante[]) : [];
  const normalizadas = lista
    .map((e) => ({
      linea_id: String(e.lineaId ?? ""),
      cantidad_entregada: Number(e.cantidadEntregada),
    }))
    .filter((e) => e.linea_id !== "" && Number.isFinite(e.cantidad_entregada) && e.cantidad_entregada >= 0);

  const r = await llamarRpcMaterial("material_entregar", {
    p_id: id,
    p_usuario: quien.actor.nombre,
    p_entregas: normalizadas,
    p_sucursal: quien.actor.sucursal,
    p_codigo: typeof codigo === "string" ? codigo : "",
    p_evidencia_path: typeof evidenciaPath === "string" ? evidenciaPath : "",
  });
  if (r.ok) await avisarEmpleado(id, "material_entregada");
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
