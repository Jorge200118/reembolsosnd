import { NextResponse } from "next/server";
import { llamarRpcMaterial } from "@/lib/materiales/rpc";
import { avisarEmpleado } from "@/lib/materiales/avisar";
import { actorDeMaterial } from "@/lib/materiales/actor";

// Quién autoriza y sobre qué sucursal salen de la cookie firmada, no del body.

export async function POST(req: Request) {
  const quien = await actorDeMaterial("materiales-gerente");
  if (!quien.ok) return NextResponse.json({ ok: false, error: quien.error }, { status: quien.status });

  const { id } = (await req.json().catch(() => ({}))) as { id?: unknown };
  if (typeof id !== "string" || !id) {
    return NextResponse.json({ ok: false, error: "Falta la solicitud" }, { status: 400 });
  }

  const r = await llamarRpcMaterial("material_autorizar", {
    p_id: id,
    p_usuario: quien.actor.nombre,
    p_sucursal: quien.actor.sucursal,
  });
  if (r.ok) await avisarEmpleado(id, "material_autorizada");
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
