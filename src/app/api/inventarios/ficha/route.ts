import { NextResponse } from "next/server";
import { actorDeMaterial } from "@/lib/materiales/actor";
import { fichaDeSolicitud } from "@/lib/inventarios/ficha";
import { urlFirmada } from "@/lib/materiales/storage";

// La ficha que abre INVENTARIOS al hacer clic en un folio de solicitud. Solo
// lee. La regla de qué entregas se muestran vive en `ficha.ts` y se prueba
// ahí; aquí queda lo que no se puede probar sin Supabase: sesión y bucket.

// El default de urlFirmada (5 min) no alcanza: la ficha se queda abierta
// mientras se comparan varias fotos contra la tabla, y una miniatura se
// rompería sola a media revisión.
const VIGENCIA_FOTO = 900;

export async function GET(req: Request) {
  const quien = await actorDeMaterial("inventarios");
  if (!quien.ok) {
    return NextResponse.json({ ok: false, error: quien.error }, { status: quien.status });
  }

  const folio = new URL(req.url).searchParams.get("folio") ?? "";

  let ficha;
  try {
    ficha = await fichaDeSolicitud(folio);
  } catch (e) {
    console.error("[inventarios] no se pudo leer la ficha:", e);
    return NextResponse.json({ ok: false, error: "No se pudo leer la solicitud" }, { status: 500 });
  }

  if (!ficha) {
    return NextResponse.json({ ok: false, error: "No se encontró esa solicitud" }, { status: 404 });
  }

  // La sucursal sale de la sesión firmada, nunca del request: el folio es
  // adivinable (SUI- + consecutivo), así que sin esto cualquiera con sesión
  // vería la evidencia de otra sucursal cambiando la cadena.
  const suya =
    quien.actor.sucursal === "*" ||
    quien.actor.sucursal.trim().toUpperCase() === ficha.sucursal.trim().toUpperCase();
  if (!suya) {
    return NextResponse.json({ ok: false, error: "Esa solicitud no es de tu sucursal" }, { status: 403 });
  }

  // Cada foto se firma por separado y un fallo NO tumba la ficha: perder una
  // miniatura no puede esconder al autorizador ni a las demás entregas. Por eso
  // no se copia el 503 de /api/materiales/evidencia, donde la foto es la
  // respuesta entera.
  const entregas = await Promise.all(
    ficha.entregas.map(async (e) => ({
      area: e.area,
      entregadoPor: e.entregadoPor,
      fechaEntrega: e.fechaEntrega,
      // Distinguir "nunca hubo foto" de "la hay y no se pudo abrir" es lo que
      // permite que la pantalla no mienta.
      tieneFoto: e.evidenciaPath !== null,
      url: e.evidenciaPath
        ? await urlFirmada(e.evidenciaPath, VIGENCIA_FOTO).catch(() => null)
        : null,
    })),
  );

  // `evidenciaPath` no viaja: el navegador no necesita la ruta del bucket.
  return NextResponse.json({
    ok: true,
    ficha: {
      folio: ficha.folio,
      sucursal: ficha.sucursal,
      empleadoNombre: ficha.empleadoNombre,
      motivo: ficha.motivo,
      estado: ficha.estado,
      autorizadoPor: ficha.autorizadoPor,
      fechaAutorizacion: ficha.fechaAutorizacion,
      entregas,
    },
  });
}
