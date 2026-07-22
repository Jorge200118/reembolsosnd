import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verificarSesion, NOMBRE_COOKIE } from "@/lib/auth/sesionEscritorio";

// La cookie es httpOnly, así que el navegador ya no puede leerla para saber
// quién está dentro: se lo pregunta aquí. Devolver la sesión ya verificada
// evita que el cliente confíe en un payload que nadie comprobó.

export async function GET() {
  const secret = process.env.EMP_SESION_SECRET ?? "";
  const token = (await cookies()).get(NOMBRE_COOKIE)?.value ?? "";
  const sesion = secret && token ? await verificarSesion(token, secret) : null;
  // "No hay sesión" es una respuesta válida a "¿quién soy?", no un error: con
  // 401 la consola del navegador pintaba un error rojo cada vez que alguien
  // abría /login sin haber entrado, y ese ruido tapa los errores de verdad.
  if (!sesion) return NextResponse.json({ ok: false });
  return NextResponse.json({ ok: true, sesion });
}
