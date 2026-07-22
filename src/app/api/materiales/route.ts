import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verificarEmpSesion, NOMBRE_COOKIE_EMP } from "@/lib/auth/empleadoSesion";
import { sucursalDelEmpleado } from "@/lib/materiales/sucursal";
import { buscarEnErp, erpConfigurado } from "@/lib/materiales/erp";

// Buscador del catálogo para la PWA. El cod_estab NO viene del cliente: sale de
// la sucursal del empleado autenticado, para que nadie consulte inventario de
// una sucursal ajena.

export async function GET(req: Request) {
  const secret = process.env.EMP_SESION_SECRET ?? "";
  const token = (await cookies()).get(NOMBRE_COOKIE_EMP)?.value ?? "";
  const sesion = secret && token ? await verificarEmpSesion(token, secret) : null;
  if (!sesion) return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });

  if (!erpConfigurado()) {
    return NextResponse.json(
      { ok: false, error: "El catálogo no está configurado en este entorno" },
      { status: 503 },
    );
  }

  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 3) return NextResponse.json({ ok: true, materiales: [] });

  const suc = await sucursalDelEmpleado(sesion.empleadoId);
  if (!suc?.codEstab) {
    return NextResponse.json(
      { ok: false, error: "Tu sucursal no está configurada, avisa a sistemas" },
      { status: 409 },
    );
  }

  try {
    return NextResponse.json({ ok: true, materiales: await buscarEnErp(q, suc.codEstab) });
  } catch {
    // Timeout, DNS, servidor apagado: para el empleado es el mismo problema.
    return NextResponse.json(
      { ok: false, error: "No se pudo consultar el catálogo, intenta de nuevo" },
      { status: 503 },
    );
  }
}
