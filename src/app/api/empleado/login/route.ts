import { NextResponse } from "next/server";
import { llamarEmpleadoAuth } from "@/lib/edge/empleadoAuth";
import { firmarEmpSesion, NOMBRE_COOKIE_EMP } from "@/lib/auth/empleadoSesion";

export async function POST(req: Request) {
  const { telefono, nip } = await req.json();
  if (typeof telefono !== "string" || typeof nip !== "string") {
    return NextResponse.json({ ok: false, error: "Datos incompletos" }, { status: 400 });
  }
  const r = await llamarEmpleadoAuth({ action: "login", telefono, nip });
  if (r.resultado !== "ok") {
    return NextResponse.json({ ok: false, resultado: r.resultado }, { status: 401 });
  }
  const secret = process.env.EMP_SESION_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: "Config faltante" }, { status: 500 });
  const token = await firmarEmpSesion(
    { empleadoId: Number(r.empleado_id), nombre: String(r.nombre) },
    secret,
  );
  const resp = NextResponse.json({ ok: true, nombre: r.nombre });
  resp.cookies.set(NOMBRE_COOKIE_EMP, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return resp;
}
