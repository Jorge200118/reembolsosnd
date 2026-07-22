import { NextResponse } from "next/server";
import { actorDeMaterial } from "@/lib/materiales/actor";
import { subirEvidencia, urlFirmada } from "@/lib/materiales/storage";
import { leerTablaMaterial } from "@/lib/materiales/rpc";

// POST: almacén sube la foto de una entrega. GET: gerente o almacén la ven,
// con una URL que caduca. En los dos casos se comprueba que la solicitud sea
// de SU sucursal: si se aceptara una ruta del bucket a secas, cualquiera con
// sesión podría ver la evidencia de otra sucursal cambiando la cadena.

async function sucursalDeLaSolicitud(id: string): Promise<{ sucursal: string; path: string | null } | null> {
  const filas = (await leerTablaMaterial(
    `rnd_material_solicitudes?id=eq.${id}&select=sucursal,evidencia_path`,
  )) as Array<{ sucursal?: string; evidencia_path?: string | null }>;
  const f = filas?.[0];
  return f?.sucursal ? { sucursal: f.sucursal, path: f.evidencia_path ?? null } : null;
}

function puedeVer(actorSucursal: string, sucursalSolicitud: string): boolean {
  return actorSucursal === "*" || actorSucursal.toUpperCase() === sucursalSolicitud.toUpperCase();
}

export async function POST(req: Request) {
  const quien = await actorDeMaterial("materiales-almacen");
  if (!quien.ok) return NextResponse.json({ ok: false, error: quien.error }, { status: quien.status });

  const form = await req.formData().catch(() => null);
  const id = String(form?.get("solicitudId") ?? "");
  const archivo = form?.get("foto");
  if (!id || !(archivo instanceof Blob) || archivo.size === 0) {
    return NextResponse.json({ ok: false, error: "Falta la foto" }, { status: 400 });
  }

  const sol = await sucursalDeLaSolicitud(id);
  if (!sol || !puedeVer(quien.actor.sucursal, sol.sucursal)) {
    return NextResponse.json({ ok: false, error: "Esa solicitud no es de tu sucursal" }, { status: 403 });
  }

  try {
    const nombre = archivo instanceof File ? archivo.name : "foto.jpg";
    return NextResponse.json({ ok: true, path: await subirEvidencia(id, archivo, nombre) });
  } catch (e) {
    console.error("[material] no se pudo subir la evidencia:", e);
    return NextResponse.json({ ok: false, error: "No se pudo subir la foto" }, { status: 503 });
  }
}

export async function GET(req: Request) {
  // El gerente también necesita verla, no solo quien entregó.
  const almacen = await actorDeMaterial("materiales-almacen");
  const quien = almacen.ok ? almacen : await actorDeMaterial("materiales-gerente");
  if (!quien.ok) return NextResponse.json({ ok: false, error: quien.error }, { status: quien.status });

  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ ok: false, error: "Falta la solicitud" }, { status: 400 });

  const sol = await sucursalDeLaSolicitud(id);
  if (!sol || !puedeVer(quien.actor.sucursal, sol.sucursal)) {
    return NextResponse.json({ ok: false, error: "Esa solicitud no es de tu sucursal" }, { status: 403 });
  }
  if (!sol.path) return NextResponse.json({ ok: false, error: "Esa entrega no tiene foto" }, { status: 404 });

  const url = await urlFirmada(sol.path);
  if (!url) return NextResponse.json({ ok: false, error: "No se pudo abrir la foto" }, { status: 503 });

  // Con ?redirigir=1 se puede colgar de un <a> y abre la foto directo. Sin el
  // parámetro devuelve JSON, por si alguna pantalla la quiere embebida.
  if (new URL(req.url).searchParams.get("redirigir") === "1") {
    return NextResponse.redirect(url);
  }
  return NextResponse.json({ ok: true, url });
}
