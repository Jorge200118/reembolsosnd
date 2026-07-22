import { NextResponse } from "next/server";
import { llamarRpcMaterial } from "@/lib/materiales/rpc";
import { avisarEmpleado } from "@/lib/materiales/avisar";

interface EntregaEntrante {
  lineaId?: unknown;
  cantidadEntregada?: unknown;
}

export async function POST(req: Request) {
  const { id, usuario, entregas } = (await req.json().catch(() => ({}))) as {
    id?: unknown;
    usuario?: unknown;
    entregas?: unknown;
  };
  if (typeof id !== "string" || !id) {
    return NextResponse.json({ ok: false, error: "Falta la solicitud" }, { status: 400 });
  }

  const lista = Array.isArray(entregas) ? (entregas as EntregaEntrante[]) : [];
  const normalizadas = lista
    .map((e) => ({
      linea_id: String(e.lineaId ?? ""),
      cantidad_entregada: Number(e.cantidadEntregada),
    }))
    .filter((e) => e.linea_id !== "" && Number.isFinite(e.cantidad_entregada) && e.cantidad_entregada >= 0);

  const r = await llamarRpcMaterial("material_entregar", {
    p_id: id,
    p_usuario: typeof usuario === "string" ? usuario : null,
    p_entregas: normalizadas,
  });
  if (r.ok) await avisarEmpleado(id, "material_entregada");
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
