import { NextResponse } from "next/server";
import { llamarRpcMaterial } from "@/lib/materiales/rpc";
import { avisarEmpleado } from "@/lib/materiales/avisar";

export async function POST(req: Request) {
  const { id, usuario } = (await req.json().catch(() => ({}))) as {
    id?: unknown;
    usuario?: unknown;
  };
  if (typeof id !== "string" || !id) {
    return NextResponse.json({ ok: false, error: "Falta la solicitud" }, { status: 400 });
  }

  const r = await llamarRpcMaterial("material_autorizar", {
    p_id: id,
    p_usuario: typeof usuario === "string" ? usuario : null,
  });
  if (r.ok) await avisarEmpleado(id, "material_autorizada");
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
