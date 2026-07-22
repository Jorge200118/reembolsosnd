import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verificarEmpSesion, NOMBRE_COOKIE_EMP } from "@/lib/auth/empleadoSesion";
import { llamarRpcMaterial } from "@/lib/materiales/rpc";

export async function POST(req: Request) {
  const secret = process.env.EMP_SESION_SECRET ?? "";
  const token = (await cookies()).get(NOMBRE_COOKIE_EMP)?.value ?? "";
  const sesion = secret && token ? await verificarEmpSesion(token, secret) : null;
  if (!sesion) return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });

  const { id } = (await req.json().catch(() => ({}))) as { id?: unknown };
  if (typeof id !== "string" || !id) {
    return NextResponse.json({ ok: false, error: "Falta la solicitud" }, { status: 400 });
  }

  // La RPC verifica que la solicitud sea de este empleado y siga pendiente.
  const r = await llamarRpcMaterial("material_cancelar", {
    p_id: id,
    p_empleado_id: sesion.empleadoId,
  });
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
