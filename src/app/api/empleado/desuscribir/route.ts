import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verificarEmpSesion, NOMBRE_COOKIE_EMP } from "@/lib/auth/empleadoSesion";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

// Da de baja una suscripción por endpoint para el chofer de la sesión.
export async function POST(req: Request) {
  const secret = process.env.EMP_SESION_SECRET ?? "";
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const token = (await cookies()).get(NOMBRE_COOKIE_EMP)?.value ?? "";
  const sesion = secret && token ? await verificarEmpSesion(token, secret) : null;
  if (!sesion) return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  if (!serviceRole) return NextResponse.json({ ok: false, error: "Config faltante" }, { status: 500 });

  const body = await req.json().catch(() => ({}));
  const res = await fetch(`${SUPABASE_URL}/functions/v1/empleado-push`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceRole}` },
    body: JSON.stringify({
      action: "desuscribir",
      empleado_id: sesion.empleadoId,
      endpoint: body.endpoint,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return NextResponse.json({ ok: false, ...data }, { status: 502 });
  return NextResponse.json({ ok: true });
}
