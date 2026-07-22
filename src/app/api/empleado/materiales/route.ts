import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verificarEmpSesion, NOMBRE_COOKIE_EMP } from "@/lib/auth/empleadoSesion";
import { llamarRpcMaterial, leerTablaMaterial } from "@/lib/materiales/rpc";

// La identidad SIEMPRE sale de la cookie firmada, nunca del body: si viniera
// del cliente, cualquiera podría pedir material a nombre de otro empleado.

async function sesionDe(): Promise<{ empleadoId: number; nombre: string } | null> {
  const secret = process.env.EMP_SESION_SECRET ?? "";
  const token = (await cookies()).get(NOMBRE_COOKIE_EMP)?.value ?? "";
  if (!secret || !token) return null;
  return verificarEmpSesion(token, secret);
}

interface LineaEntrante {
  codProd?: unknown;
  descripcion?: unknown;
  unidad?: unknown;
  cantidad?: unknown;
  costoUnitario?: unknown;
  existenciaAlPedir?: unknown;
}

function aLineaRpc(l: LineaEntrante) {
  const cantidad = Number(l.cantidad);
  return {
    cod_prod: String(l.codProd ?? "").trim(),
    descripcion: String(l.descripcion ?? "").trim(),
    unidad: l.unidad == null ? null : String(l.unidad).trim(),
    cantidad,
    costo_unitario: l.costoUnitario == null ? null : Number(l.costoUnitario),
    existencia_al_pedir: l.existenciaAlPedir == null ? null : Number(l.existenciaAlPedir),
  };
}

export async function POST(req: Request) {
  const sesion = await sesionDe();
  if (!sesion) return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { nota?: unknown; lineas?: unknown };
  const entrantes = Array.isArray(body.lineas) ? (body.lineas as LineaEntrante[]) : [];
  const lineas = entrantes.map(aLineaRpc);

  // Se valida aquí Y en la RPC. Aquí para dar un mensaje bonito; allá porque
  // la base no debe confiar en que alguien haya validado antes.
  if (lineas.length === 0) {
    return NextResponse.json({ ok: false, error: "Agrega al menos un material" }, { status: 400 });
  }
  if (lineas.some((l) => !l.cod_prod || !l.descripcion || !Number.isFinite(l.cantidad) || l.cantidad <= 0)) {
    return NextResponse.json({ ok: false, error: "Hay materiales con cantidad inválida" }, { status: 400 });
  }

  const r = await llamarRpcMaterial("material_crear", {
    p_empleado_id: sesion.empleadoId,
    p_nota: typeof body.nota === "string" ? body.nota : null,
    p_lineas: lineas,
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
