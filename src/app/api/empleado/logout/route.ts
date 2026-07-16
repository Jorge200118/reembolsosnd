import { NextResponse } from "next/server";
import { NOMBRE_COOKIE_EMP } from "@/lib/auth/empleadoSesion";

export async function POST() {
  const resp = NextResponse.json({ ok: true });
  resp.cookies.set(NOMBRE_COOKIE_EMP, "", { httpOnly: true, path: "/", maxAge: 0 });
  return resp;
}
