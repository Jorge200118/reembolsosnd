import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verificarEmpSesion, NOMBRE_COOKIE_EMP } from "@/lib/auth/empleadoSesion";
import { llamarRpcMaterial, leerTablaMaterial } from "@/lib/materiales/rpc";
import { sucursalDelEmpleado } from "@/lib/materiales/sucursal";
import { buscarEnErp, erpConfigurado } from "@/lib/materiales/erp";
import { confirmarConElErp, type LineaPedida } from "@/lib/materiales/confirmar";

// La identidad SIEMPRE sale de la cookie firmada, nunca del body: si viniera
// del cliente, cualquiera podría pedir material a nombre de otro empleado.
// Por lo mismo, del carrito solo se cree el código y la cantidad; descripción,
// costo y existencia se vuelven a preguntar al ERP (ver confirmar.ts).

async function sesionDe(): Promise<{ empleadoId: number; nombre: string } | null> {
  const secret = process.env.EMP_SESION_SECRET ?? "";
  const token = (await cookies()).get(NOMBRE_COOKIE_EMP)?.value ?? "";
  if (!secret || !token) return null;
  return verificarEmpSesion(token, secret);
}

export async function POST(req: Request) {
  const sesion = await sesionDe();
  if (!sesion) return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { nota?: unknown; lineas?: unknown };
  const entrantes = Array.isArray(body.lineas) ? (body.lineas as Record<string, unknown>[]) : [];
  const pedidas: LineaPedida[] = entrantes.map((l) => ({
    codProd: String(l.codProd ?? ""),
    cantidad: Number(l.cantidad),
  }));

  if (!erpConfigurado()) {
    return NextResponse.json(
      { ok: false, error: "El catálogo no está configurado en este entorno" },
      { status: 503 },
    );
  }

  const suc = await sucursalDelEmpleado(sesion.empleadoId);
  if (!suc?.codEstab) {
    return NextResponse.json(
      { ok: false, error: "Tu sucursal no está configurada, avisa a sistemas" },
      { status: 409 },
    );
  }
  const codEstab = suc.codEstab;

  let confirmadas;
  try {
    confirmadas = await confirmarConElErp(pedidas, (q) => buscarEnErp(q, codEstab));
  } catch (e) {
    // Si el ERP no contesta preferimos no guardar: una solicitud con costos
    // inventados es peor que pedirle al empleado que lo intente en un minuto.
    console.error("[material] no se pudo confirmar el catálogo:", e);
    return NextResponse.json(
      { ok: false, error: "No se pudo confirmar el catálogo, intenta de nuevo en un momento" },
      { status: 503 },
    );
  }
  if (!confirmadas.ok) {
    return NextResponse.json({ ok: false, error: confirmadas.error }, { status: 400 });
  }

  const r = await llamarRpcMaterial("material_crear", {
    p_empleado_id: sesion.empleadoId,
    p_nota: typeof body.nota === "string" ? body.nota : null,
    p_lineas: confirmadas.lineas,
  });
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}

export async function GET() {
  const sesion = await sesionDe();
  if (!sesion) return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });

  const campos =
    "id,folio,estado,nota,creado_en,fecha_autorizacion,motivo_rechazo,fecha_entrega," +
    "rnd_material_lineas(id,orden,cod_prod,descripcion,unidad,cantidad,cantidad_entregada,costo_unitario)";
  const consulta =
    `rnd_material_solicitudes?empleado_id=eq.${sesion.empleadoId}` +
    `&select=${encodeURIComponent(campos)}&order=creado_en.desc&limit=30`;

  try {
    const solicitudes = await leerTablaMaterial(consulta);
    return NextResponse.json({ ok: true, solicitudes });
  } catch (e) {
    console.error("[material] no se pudieron leer las solicitudes:", e);
    return NextResponse.json({ ok: false, error: "No se pudieron cargar tus solicitudes" }, { status: 503 });
  }
}
