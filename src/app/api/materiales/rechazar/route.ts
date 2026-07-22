import { NextResponse } from "next/server";
import { llamarRpcMaterial } from "@/lib/materiales/rpc";
import { avisarEmpleado } from "@/lib/materiales/avisar";
import { actorDeMaterial } from "@/lib/materiales/actor";

// Quién rechaza y sobre qué sucursal salen de la cookie firmada, no del body.

export async function POST(req: Request) {
  const quien = await actorDeMaterial("materiales-gerente");
  if (!quien.ok) return NextResponse.json({ ok: false, error: quien.error }, { status: quien.status });

  const { id, motivo } = (await req.json().catch(() => ({}))) as { id?: unknown; motivo?: unknown };
  if (typeof id !== "string" || !id) {
    return NextResponse.json({ ok: false, error: "Falta la solicitud" }, { status: 400 });
  }

  const r = await llamarRpcMaterial("material_rechazar", {
    p_id: id,
    p_usuario: quien.actor.nombre,
    p_motivo: typeof motivo === "string" ? motivo : null,
    p_sucursal: quien.actor.sucursal,
  });
  if (r.ok) await avisarEmpleado(id, "material_rechazada");
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
