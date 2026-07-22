import { NextResponse } from "next/server";
import { llamarRpcMaterial } from "@/lib/materiales/rpc";
import { avisarEmpleado } from "@/lib/materiales/avisar";

export async function POST(req: Request) {
  const { id, usuario, motivo } = (await req.json().catch(() => ({}))) as {
    id?: unknown;
    usuario?: unknown;
    motivo?: unknown;
  };
  if (typeof id !== "string" || !id) {
    return NextResponse.json({ ok: false, error: "Falta la solicitud" }, { status: 400 });
  }

  const r = await llamarRpcMaterial("material_rechazar", {
    p_id: id,
    p_usuario: typeof usuario === "string" ? usuario : null,
    p_motivo: typeof motivo === "string" ? motivo : null,
  });
  if (r.ok) await avisarEmpleado(id, "material_rechazada");
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
