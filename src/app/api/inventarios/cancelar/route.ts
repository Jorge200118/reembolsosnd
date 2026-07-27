import { NextResponse } from "next/server";
import { actorDeMaterial } from "@/lib/materiales/actor";
import { llamarRpcMaterial, leerTablaMaterial } from "@/lib/materiales/rpc";
import { cancelarEnErp } from "@/lib/inventarios/erp";

// Cancela un folio ya aplicado: revierte el movimiento en BMS y lo marca aquí.
//
// El orden es al revés que en aplicar, y por la misma lógica de "romper hacia el
// lado seguro". Aquí primero se cancela en BMS y después se registra: si truena
// en medio, la aplicación se queda 'aplicada' con las partidas apartadas. Eso es
// conservador —el material no se vuelve a ofrecer— y se resuelve mirando BMS.
// Al revés (marcar cancelada aquí y fallar allá) las partidas volverían a la
// lista y se descargarían otra vez sobre un folio que sigue vivo.

interface FilaAplicacion {
  id: string;
  folio_bms: string | null;
  cod_estab: number;
  sucursal: string;
  estado: string;
}

export async function POST(req: Request) {
  const quien = await actorDeMaterial("inventarios");
  if (!quien.ok) return NextResponse.json({ ok: false, error: quien.error }, { status: quien.status });

  const { id, motivo } = (await req.json().catch(() => ({}))) as { id?: unknown; motivo?: unknown };
  const aplicacionId = typeof id === "string" ? id.trim() : "";
  const razon = typeof motivo === "string" ? motivo.trim() : "";
  if (!aplicacionId) {
    return NextResponse.json({ ok: false, error: "Falta la aplicación" }, { status: 400 });
  }

  // El folio y la sucursal salen de la base, nunca del body: si vinieran de
  // fuera, cualquiera podría mandar a cancelar un folio ajeno de BMS.
  let fila: FilaAplicacion | undefined;
  try {
    const filas = (await leerTablaMaterial(
      `rnd_inventario_aplicaciones?select=id,folio_bms,cod_estab,sucursal,estado&id=eq.${encodeURIComponent(aplicacionId)}`,
    )) as FilaAplicacion[];
    fila = filas[0];
  } catch (e) {
    console.error("[inventarios] No se pudo leer la aplicación:", e);
    return NextResponse.json({ ok: false, error: "No se pudo leer la aplicación" }, { status: 500 });
  }

  if (!fila) return NextResponse.json({ ok: false, error: "No existe esa aplicación" }, { status: 404 });

  if (quien.actor.sucursal !== "*" && quien.actor.sucursal !== fila.sucursal) {
    return NextResponse.json({ ok: false, error: "No puedes cancelar folios de otra sucursal" }, { status: 403 });
  }

  if (fila.estado === "cancelada") {
    return NextResponse.json({ ok: true, folio: fila.folio_bms, yaEstaba: true });
  }
  if (fila.estado !== "aplicada" || !fila.folio_bms) {
    return NextResponse.json(
      { ok: false, error: `Solo se cancela una aplicación con folio; esta está ${fila.estado}` },
      { status: 409 },
    );
  }

  // 1. Cancelar en BMS.
  const bms = await cancelarEnErp(
    fila.cod_estab,
    fila.folio_bms,
    process.env.BMS_USUARIO ?? "23",
    razon,
  );

  if (bms.estado === "rechazado") {
    return NextResponse.json({ ok: false, codigo: bms.codigo, error: bms.error }, { status: 409 });
  }

  if (bms.estado === "desconocido") {
    // No se marca nada: no se sabe si BMS canceló. Se queda 'aplicada', que es
    // el estado conservador (las partidas siguen apartadas).
    console.error(`[inventarios] Cancelación en estado desconocido (${aplicacionId}): ${bms.error}`);
    return NextResponse.json(
      {
        ok: false,
        codigo: "ESTADO_DESCONOCIDO",
        error:
          `No se pudo confirmar si el ERP canceló el folio ${fila.folio_bms}. ` +
          "Revísalo en BMS antes de volver a intentar.",
      },
      { status: 502 },
    );
  }

  // 2. Registrar la cancelación aquí. Las partidas vuelven a estar pendientes:
  //    el material se entregó igual, así que sigue faltando descargarlo.
  const r = await llamarRpcMaterial("inventario_cancelar", {
    p_id: aplicacionId,
    p_usuario: quien.actor.nombre,
    p_motivo: razon,
  });

  if (!r.ok) {
    console.error(`[inventarios] Folio ${fila.folio_bms} cancelado en BMS pero sin registrar aquí`);
    return NextResponse.json(
      {
        ok: false,
        codigo: "SIN_REGISTRAR",
        error: `El ERP canceló el folio ${fila.folio_bms}, pero no se pudo registrar aquí. Avisa a sistemas.`,
        folio: fila.folio_bms,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, folio: fila.folio_bms, yaEstaba: bms.yaEstaba });
}
