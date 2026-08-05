import { NextResponse } from "next/server";
import { actorDeMaterial } from "@/lib/materiales/actor";
import { llamarRpcMaterial } from "@/lib/materiales/rpc";
import { pendientesPorSucursal } from "@/lib/inventarios/pendientes";
import { existenciasEnErp, aplicarEnErp } from "@/lib/inventarios/erp";
import { evaluarPartidas } from "@/lib/inventarios/evaluar";
import { notasParaBms } from "@/lib/inventarios/notas";

// Descarga de BMS lo que ya se entregó. Es la única ruta del módulo que ESCRIBE.
//
// El orden es RESERVAR -> APLICAR EN BMS -> CONFIRMAR, y no es capricho: son dos
// sistemas sin una transacción que los abarque, así que hay que decidir hacia
// qué lado se rompe. El peor error posible es la doble descarga (BMS graba y
// esta base no se entera, la pantalla vuelve a ofrecer la partida y el material
// se descuenta dos veces). Reservando primero, un fallo a media operación deja
// las partidas apartadas y un pendiente visible, en vez de soltarlas.

export async function POST(req: Request) {
  const quien = await actorDeMaterial("inventarios");
  if (!quien.ok) return NextResponse.json({ ok: false, error: quien.error }, { status: quien.status });

  const { sucursal, lineaIds } = (await req.json().catch(() => ({}))) as {
    sucursal?: unknown;
    lineaIds?: unknown;
  };
  const suc = typeof sucursal === "string" ? sucursal.trim() : "";
  const ids = Array.isArray(lineaIds) ? [...new Set(lineaIds.map(String).filter(Boolean))] : [];
  if (!suc) return NextResponse.json({ ok: false, error: "Falta la sucursal" }, { status: 400 });
  if (ids.length === 0) return NextResponse.json({ ok: false, error: "No seleccionaste partidas" }, { status: 400 });

  // La sucursal sale del body pero se coteja contra la sesión: el admin ('*')
  // puede aplicar en cualquiera, los demás solo en la suya. Sin esto, cualquiera
  // con el rol descargaría inventario de otra sucursal.
  if (quien.actor.sucursal !== "*" && quien.actor.sucursal !== suc) {
    return NextResponse.json({ ok: false, error: "No puedes aplicar en esa sucursal" }, { status: 403 });
  }

  // 1. Se relee lo pendiente del servidor. Lo que manda el navegador son solo
  //    los IDs elegidos; cantidades y costos NUNCA vienen del body, porque
  //    entonces cualquiera podría descargar la cantidad que se le antojara.
  const grupos = await pendientesPorSucursal(suc).catch(() => null);
  if (!grupos) return NextResponse.json({ ok: false, error: "No se pudieron leer las entregas" }, { status: 500 });

  const grupo = grupos.find((g) => g.sucursal === suc);
  if (!grupo || grupo.codEstab === null) {
    return NextResponse.json(
      { ok: false, error: "Esa sucursal no tiene nada pendiente o no está mapeada al ERP" },
      { status: 409 },
    );
  }

  const elegidas = grupo.partidas.filter((p) => ids.includes(p.lineaId));
  if (elegidas.length !== ids.length) {
    return NextResponse.json(
      { ok: false, error: "Algunas partidas ya no están pendientes; recarga la pantalla" },
      { status: 409 },
    );
  }

  // 2. Se revalida contra el ERP justo antes de escribir. El preview pudo
  //    haberse hecho hace rato y la existencia se mueve: un producto de alta
  //    rotación puede quedar en cero entre que se ve la pantalla y se aprieta.
  let evaluadas;
  try {
    const { productos } = await existenciasEnErp([...new Set(elegidas.map((p) => p.codProd))], grupo.codEstab);
    evaluadas = evaluarPartidas(elegidas, productos);
  } catch {
    return NextResponse.json({ ok: false, error: "No se pudo consultar el inventario del ERP" }, { status: 502 });
  }

  const problemas = evaluadas.filter((p) => p.estado !== "ok");
  if (problemas.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        codigo: "NO_ALCANZA",
        error: "El inventario cambió: hay partidas que ya no se pueden descargar completas",
        detalle: problemas.map((p) => ({
          codProd: p.codProd,
          descripcion: p.descripcionErp || p.descripcion,
          entregado: p.cantidad,
          existencia: p.existencia,
          estado: p.estado,
        })),
      },
      { status: 409 },
    );
  }

  // 3. RESERVAR. A partir de aquí las partidas quedan apartadas.
  const reserva = await llamarRpcMaterial("inventario_reservar", {
    p_sucursal: suc,
    p_cod_estab: grupo.codEstab,
    p_usuario: quien.actor.nombre,
    p_lineas: evaluadas.map((p) => ({
      linea_id: p.lineaId,
      cod_prod: p.codProd,
      cantidad: p.cantidad,
      costo_unitario: p.costoUnitario ?? p.costoErp,
    })),
  });
  if (!reserva.ok) {
    return NextResponse.json(
      { ok: false, codigo: reserva.codigo ?? "RESERVA", error: reserva.error ?? "No se pudo apartar" },
      { status: 409 },
    );
  }
  const aplicacionId = String(reserva.id);

  // 4. APLICAR EN BMS.
  const bms = await aplicarEnErp(
    grupo.codEstab,
    // Usuario del ERP, no el nombre de la sesión: es el que queda en la
    // bitácora de BMS y tiene que ser uno que exista allá.
    process.env.BMS_USUARIO ?? "23",
    evaluadas.map((p) => ({ codProd: p.codProd, cantidad: p.cantidad })),
    // Los motivos salen de `evaluadas`, no del body: es el mismo criterio que
    // las cantidades. Si vinieran del navegador, cualquiera escribiría lo que
    // quisiera en la bitácora del ERP.
    notasParaBms(evaluadas),
  );

  if (bms.estado === "rechazado") {
    // El ERP dijo que no y no escribió nada: se sueltan las partidas para que
    // se puedan volver a intentar cuando haya inventario.
    await llamarRpcMaterial("inventario_liberar", { p_id: aplicacionId, p_motivo: bms.error });
    return NextResponse.json(
      { ok: false, codigo: bms.codigo, error: bms.error, detalle: bms.detalle },
      { status: 409 },
    );
  }

  if (bms.estado === "desconocido") {
    // NO se libera. No se sabe si BMS grabó, y soltar las partidas aquí es
    // exactamente cómo se produce una doble descarga. Queda 'en_proceso' para
    // que alguien lo coteje contra BMS a mano.
    console.error(`[inventarios] Estado desconocido en aplicación ${aplicacionId}: ${bms.error}`);
    return NextResponse.json(
      {
        ok: false,
        codigo: "ESTADO_DESCONOCIDO",
        error:
          "No se pudo confirmar si el ERP registró el movimiento. Las partidas quedaron apartadas: " +
          "revisa en BMS si se generó el folio antes de volver a intentar.",
        aplicacionId,
      },
      { status: 502 },
    );
  }

  // 5. CONFIRMAR. Se guarda lo que BMS reportó haber aplicado, no lo que
  //    pedimos: son iguales porque el ERP revierte si difiere, pero se registra
  //    su versión para que el rastro sea del ERP y no nuestro.
  const porCodigo = new Map(bms.partidas.map((p) => [p.codProd, p]));
  const confirmacion = await llamarRpcMaterial("inventario_confirmar", {
    p_id: aplicacionId,
    p_folio_bms: bms.folio,
    p_aplicadas: evaluadas.map((p) => ({
      linea_id: p.lineaId,
      cantidad_aplicada: porCodigo.get(p.codProd)?.cantidadAplicada ?? p.cantidad,
    })),
  });

  if (!confirmacion.ok) {
    // BMS sí grabó (tenemos folio) pero no pudimos registrarlo. Las partidas
    // siguen apartadas, así que no hay riesgo de duplicar; queda anotar el
    // folio a mano. Se devuelve para que se pueda hacer.
    console.error(`[inventarios] Folio ${bms.folio} aplicado pero sin confirmar (${aplicacionId})`);
    return NextResponse.json(
      {
        ok: false,
        codigo: "SIN_CONFIRMAR",
        error: `El ERP generó el folio ${bms.folio}, pero no se pudo registrar aquí. Anótalo y avisa a sistemas.`,
        folio: bms.folio,
        aplicacionId,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    folio: bms.folio,
    partidas: bms.partidas.length,
    unidades: bms.partidas.reduce((s, p) => s + p.cantidadAplicada, 0),
  });
}
