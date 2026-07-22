import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verificarEmpSesion, NOMBRE_COOKIE_EMP } from "@/lib/auth/empleadoSesion";
import { sucursalDelEmpleado } from "@/lib/materiales/sucursal";
import { normalizarMateriales } from "@/lib/materiales/normalizar";

// Este handler es el ÚNICO que conoce la dirección de censos-web y su llave.
// Nunca se llama desde el navegador a censos directamente: eso filtraría la
// llave y chocaría con CORS.
//
// El cod_estab NO viene del cliente: sale de la sucursal del empleado
// autenticado, para que nadie consulte inventario de una sucursal ajena.

const TIMEOUT_MS = 5000;

export async function GET(req: Request) {
  const secret = process.env.EMP_SESION_SECRET ?? "";
  const token = (await cookies()).get(NOMBRE_COOKIE_EMP)?.value ?? "";
  const sesion = secret && token ? await verificarEmpSesion(token, secret) : null;
  if (!sesion) return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });

  const base = process.env.CENSOS_API_URL;
  const llave = process.env.CENSOS_API_KEY;
  if (!base || !llave) {
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

  const url = `${base.replace(/\/$/, "")}/api/materiales?q=${encodeURIComponent(q)}&codEstab=${suc.codEstab}`;
  try {
    const res = await fetch(url, {
      headers: { "x-api-key": llave, "ngrok-skip-browser-warning": "true" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: "No se pudo consultar el catálogo, intenta de nuevo" },
        { status: 503 },
      );
    }
    const data = (await res.json()) as { materiales?: unknown };
    return NextResponse.json({ ok: true, materiales: normalizarMateriales(data.materiales) });
  } catch {
    // Timeout, DNS, servidor apagado: para el empleado es el mismo problema.
    return NextResponse.json(
      { ok: false, error: "No se pudo consultar el catálogo, intenta de nuevo" },
      { status: 503 },
    );
  }
}
