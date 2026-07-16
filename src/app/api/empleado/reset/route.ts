import { NextResponse } from "next/server";
import { llamarEmpleadoAuth } from "@/lib/edge/empleadoAuth";

export async function POST(req: Request) {
  const { telefono, codigo_empleado, nip_nuevo } = await req.json();
  if (typeof telefono !== "string" || typeof codigo_empleado !== "string" || typeof nip_nuevo !== "string") {
    return NextResponse.json({ ok: false, error: "Datos incompletos" }, { status: 400 });
  }
  const r = await llamarEmpleadoAuth({ action: "reset", telefono, codigo_empleado, nip_nuevo });
  if (r.resultado !== "ok") {
    return NextResponse.json({ ok: false, resultado: r.resultado }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
