import { NextResponse } from "next/server";
import { NOMBRE_COOKIE } from "@/lib/auth/sesionEscritorio";

// Con la cookie en httpOnly el navegador ya no puede borrarla solo.

export async function POST() {
  const resp = NextResponse.json({ ok: true });
  resp.cookies.set(NOMBRE_COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
  return resp;
}
