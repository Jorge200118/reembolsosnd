import type {
  PartidaPendiente,
  ExistenciaErp,
  PartidaEvaluada,
  EstadoPartida,
  TotalesPreview,
} from "./tipos";

/** Los códigos viajan con espacios y en cualquier caja entre Supabase y el ERP. */
function llave(cod: string): string {
  return String(cod || "").trim().toUpperCase();
}

/**
 * Cruza lo entregado contra lo que el ERP tiene hoy y dice, partida por
 * partida, cuánto se podría descargar de verdad.
 *
 * Lo importante que hace esta función y que no es obvio: **acumula el consumo
 * por producto**. BMS aplica las partidas una por una y la existencia se va
 * agotando, así que dos entregas de 3 y 2 piezas del mismo código contra una
 * existencia de 4 no son "las dos caben": la segunda solo alcanza 1. Evaluar
 * cada línea contra la existencia original dejaría pasar un folio que BMS
 * recortaría en silencio (ver `modifica_inventario`, que no avisa: recorta y
 * devuelve 0 como si nada).
 *
 * El orden de entrada manda: quien va primero se lleva el inventario.
 */
export function evaluarPartidas(
  pendientes: readonly PartidaPendiente[],
  existencias: readonly ExistenciaErp[],
): PartidaEvaluada[] {
  const porCodigo = new Map<string, ExistenciaErp>();
  for (const e of existencias) porCodigo.set(llave(e.codProd), e);

  // Cuánto queda por repartir de cada producto conforme se avanza en la lista.
  const restante = new Map<string, number>();

  return pendientes.map((p) => {
    const k = llave(p.codProd);
    const erp = porCodigo.get(k);

    const base = {
      ...p,
      existencia: erp?.existencia ?? null,
      descripcionErp: erp?.descripcion ?? "",
      costoErp: erp?.costo ?? null,
      permiteNegativo: erp?.permiteNegativo ?? false,
    };

    // El ERP no lo conoce (o ni siquiera contestó por él). No se inventa nada:
    // se muestra para que alguien lo revise, pero no se puede descargar.
    if (!erp || !erp.existe) {
      return { ...base, cantidadAplicable: 0, estado: "sin_catalogo" as EstadoPartida, seleccionablePorDefecto: false };
    }

    // Producto de servicio: modifica_inventario sale con return 0 sin tocar
    // nada. Mandarlo solo ensuciaría el folio.
    if (erp.esServicio) {
      return { ...base, cantidadAplicable: 0, estado: "servicio" as EstadoPartida, seleccionablePorDefecto: false };
    }

    // null se trata como cero, nunca como "hay de sobra": si no sabemos la
    // existencia, lo seguro es no descargar.
    const disponible = restante.get(k) ?? Math.max(0, erp.existencia ?? 0);
    const aplicable = Math.max(0, Math.min(p.cantidad, disponible));
    restante.set(k, disponible - aplicable);

    let estado: EstadoPartida;
    if (aplicable === 0) estado = "sin_existencia";
    else if (aplicable < p.cantidad) estado = "insuficiente";
    else estado = "ok";

    return {
      ...base,
      cantidadAplicable: aplicable,
      estado,
      // Solo se marca sola la partida que se descarga completa. Todo lo demás
      // exige que INVENTARIOS lo mire y lo decida a mano.
      seleccionablePorDefecto: estado === "ok",
    };
  });
}

/**
 * Totales del folio que se armaría. Cuenta la cantidad APLICABLE, no la
 * entregada: es lo que BMS realmente bajaría.
 *
 * El costo se calcula como lo hace el ERP: **el unitario se redondea a 2
 * decimales y se multiplica después**. No es un detalle cosmético — en el folio
 * A687, un costo de 0.8461 por 100 piezas quedó registrado en BMS como $85.00,
 * no como $84.61. Si aquí se multiplicara sin redondear, el preview y el folio
 * no cuadrarían y crecería con la cantidad.
 *
 * La valuación del inventario NO usa este número: `modifica_inventario`
 * reescribe el costo con el costo_promedio real para las salidas. Esto es solo
 * el importe que queda escrito en la cabecera y las partidas.
 */
export function totalesDe(partidas: readonly PartidaEvaluada[]): TotalesPreview {
  let unidades = 0;
  let costo = 0;
  let cuenta = 0;
  for (const p of partidas) {
    if (p.cantidadAplicable <= 0) continue;
    cuenta += 1;
    unidades += p.cantidadAplicable;
    // El costo congelado al pedir manda; si la partida no lo trae, se usa el
    // costo promedio de hoy. Cero solo cuando no hay ninguno de los dos.
    const unitario = p.costoUnitario ?? p.costoErp ?? 0;
    costo += p.cantidadAplicable * Math.round(unitario * 100) / 100;
  }
  return { partidas: cuenta, unidades, costo };
}
