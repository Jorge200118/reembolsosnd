import { leerTablaMaterial } from "@/lib/materiales/rpc";
import type { PartidaPendiente } from "./tipos";

// Fila cruda de la vista `rnd_inventario_pendientes` (migración 0034).
interface FilaPendiente {
  linea_id: string;
  solicitud_id: string;
  folio_solicitud: string;
  sucursal: string;
  cod_estab: number | null;
  empleado_nombre: string;
  fecha_entrega: string | null;
  area: string | null;
  cod_prod: string;
  descripcion: string;
  unidad: string | null;
  cantidad: number | string;
  costo_unitario: number | string | null;
  motivo: string | null;
}

export interface GrupoSucursal {
  sucursal: string;
  /** Null = la sucursal no está mapeada a un establecimiento del ERP. */
  codEstab: number | null;
  partidas: PartidaPendiente[];
}

function aNumero(v: number | string | null): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Lo entregado que todavía no se descarga del ERP, agrupado por sucursal.
 *
 * Se lee con service_role porque la pantalla es de un rol interno y la vista
 * corre con security_invoker: con la llave anónima devolvería según el RLS del
 * visitante, no lo que INVENTARIOS necesita ver.
 *
 * @param sucursal abreviatura (LMM, FTE...) o '*' para verlas todas (admin).
 */
export async function pendientesPorSucursal(sucursal: string): Promise<GrupoSucursal[]> {
  const filtro =
    sucursal === "*" ? "" : `&sucursal=eq.${encodeURIComponent(sucursal)}`;
  const filas = (await leerTablaMaterial(
    `rnd_inventario_pendientes?select=*${filtro}&order=sucursal.asc,fecha_entrega.asc`,
  )) as FilaPendiente[];

  const grupos = new Map<string, GrupoSucursal>();
  for (const f of filas) {
    const suc = String(f.sucursal || "").trim();
    if (!grupos.has(suc)) {
      grupos.set(suc, { sucursal: suc, codEstab: f.cod_estab ?? null, partidas: [] });
    }
    grupos.get(suc)!.partidas.push({
      lineaId: f.linea_id,
      solicitudId: f.solicitud_id,
      folioSolicitud: f.folio_solicitud,
      codProd: String(f.cod_prod || "").trim().toUpperCase(),
      descripcion: f.descripcion,
      unidad: f.unidad,
      cantidad: aNumero(f.cantidad) ?? 0,
      costoUnitario: aNumero(f.costo_unitario),
      empleadoNombre: f.empleado_nombre,
      area: f.area,
      fechaEntrega: f.fecha_entrega,
      motivo: f.motivo ?? "",
    });
  }

  return [...grupos.values()].sort((a, b) => a.sucursal.localeCompare(b.sucursal));
}
