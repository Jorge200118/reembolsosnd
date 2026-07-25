import { NextResponse } from "next/server";
import { esArea, normalizarRol } from "@devoluciones/domain";
import { firmarSesion, NOMBRE_COOKIE, type Sesion } from "@/lib/auth/sesionEscritorio";

// El login del personal pasa por aquí y no por el navegador, porque la cookie
// tiene que salir FIRMADA del servidor. Antes el navegador llamaba solo a
// login-comida y se escribía su propia cookie: por eso nada de lo que dijera
// era creíble. La contraseña nunca se guarda ni se registra.

const DIAS = 7;

export async function POST(req: Request) {
  const { email, password } = (await req.json().catch(() => ({}))) as {
    email?: unknown;
    password?: unknown;
  };
  if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
    return NextResponse.json({ ok: false, error: "Datos incompletos" }, { status: 400 });
  }

  const secret = process.env.EMP_SESION_SECRET;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!secret || !url || !anon) {
    return NextResponse.json({ ok: false, error: "Config faltante en el servidor" }, { status: 500 });
  }

  let datos: { ok?: boolean; usuario?: { email: string; nombre: string; rol: string; sucursal: string | null; area?: string | null }; error?: string };
  try {
    const res = await fetch(`${url}/functions/v1/login-comida`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${anon}` },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
    });
    datos = await res.json();
  } catch {
    return NextResponse.json({ ok: false, error: "No se pudo contactar al servidor" }, { status: 503 });
  }

  if (!datos.ok || !datos.usuario) {
    return NextResponse.json({ ok: false, error: datos.error ?? "Correo o contraseña incorrectos" }, { status: 401 });
  }

  const sesion: Sesion = {
    email: datos.usuario.email,
    nombre: datos.usuario.nombre,
    rol: normalizarRol(datos.usuario.rol),
    rolCrudo: datos.usuario.rol,
    sucursal: datos.usuario.sucursal,
    // Un área que no sea una de las cuatro vale lo mismo que no tener área:
    // no se firma un valor que después nadie va a poder interpretar.
    area: esArea(datos.usuario.area) ? datos.usuario.area : null,
  };

  const resp = NextResponse.json({ ok: true, sesion });
  resp.cookies.set(NOMBRE_COOKIE, await firmarSesion(sesion, secret), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * DIAS,
  });
  return resp;
}
