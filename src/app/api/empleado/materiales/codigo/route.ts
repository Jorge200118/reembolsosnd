import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verificarEmpSesion, NOMBRE_COOKIE_EMP } from "@/lib/auth/empleadoSesion";
import { llamarRpcMaterial } from "@/lib/materiales/rpc";

// El empleado_id sale de su cookie firmada, nunca del cliente: si viniera del
// body, cualquiera pediría el código de la solicitud de otro.

export async function GET(req: Request) {
  const secret = process.env.EMP_SESION_SECRET ?? "";
  const token = (await cookies()).get(NOMBRE_COOKIE_EMP)?.value ?? "";
  const sesion = secret && token ? await verificarEmpSesion(token, secret) : null;
  if (!sesion) return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ ok: false, error: "Falta la solicitud" }, { status: 400 });

  const r = await llamarRpcMaterial("material_codigo", {
    p_id: id,
    p_empleado_id: sesion.empleadoId,
  });
  return NextResponse.json(r, { status: r.ok ? 200 : 404 });
}
