import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verificarEmpSesion, NOMBRE_COOKIE_EMP } from "@/lib/auth/empleadoSesion";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

// Registra la suscripción push del navegador. El empleado_id SIEMPRE sale de la
// cookie firmada, nunca del body. Llama a empleado-push con el service_role
// (server-only) porque esa edge exige claim service_role.
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
      action: "suscribir",
      empleado_id: sesion.empleadoId,
      endpoint: body.endpoint,
      p256dh: body.p256dh,
      auth: body.auth,
      user_agent: body.user_agent,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return NextResponse.json({ ok: false, ...data }, { status: 502 });
  return NextResponse.json({ ok: true });
}
