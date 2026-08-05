import { leerTablaMaterial } from "@/lib/materiales/rpc";

// Quién autorizó una solicitud de uso interno y qué evidencia dejó cada área al
// entregarla. Es lo que INVENTARIOS necesita saber ANTES de descargar el ERP, y
// hoy no lo tiene a la mano en ninguna de sus dos pestañas.

/** Una entrega: un área que surtió lo suyo, con su foto. */
export interface EntregaFicha {
  /** null = la entregó alguien sin área (sucursales que no las usan). */
  area: string | null;
  entregadoPor: string | null;
  fechaEntrega: string | null;
  /** Ruta cruda en el bucket. Null = no quedó foto. No sale al navegador. */
  evidenciaPath: string | null;
}

export interface FichaSolicitud {
  folio: string;
  sucursal: string;
  empleadoNombre: string;
  motivo: string;
  estado: string;
  autorizadoPor: string | null;
  fechaAutorizacion: string | null;
  entregas: EntregaFicha[];
}

interface FilaSolicitud {
  id: string;
  folio: string;
  sucursal: string;
  empleado_nombre: string;
  motivo: string | null;
  estado: string;
  autorizado_por: string | null;
  fecha_autorizacion: string | null;
  entregado_por: string | null;
  fecha_entrega: string | null;
  evidencia_path: string | null;
}

/** Fila de `rnd_material_entregas_area` (migración 0032). */
interface FilaArea {
  area: string;
  entregado_por: string;
  fecha_entrega: string;
  evidencia_path: string;
}

type SolicitudParaEntregas = Pick<
  FilaSolicitud,
  "entregado_por" | "fecha_entrega" | "evidencia_path"
>;

/**
 * Las entregas de una solicitud: todas las filas por área, y ADEMÁS la foto de
 * la solicitud cuando no es copia de ninguna de ellas.
 *
 * La segunda mitad no es paranoia. `material_entregar` con `p_area` nulo no
 * inserta fila por área (0032:246) pero sí pisa `evidencia_path` de la
 * solicitud (0032:262). O sea: si un encargado sin área cierra una solicitud
 * que otras áreas ya venían surtiendo, su foto solo existe ahí. Con la regla
 * fácil ("si no hay filas de área, usa la de la solicitud") esa foto no se
 * vería nunca, y perder evidencia en silencio es lo único que este módulo no
 * se puede permitir.
 */
export function armarEntregas(sol: SolicitudParaEntregas, filas: FilaArea[]): EntregaFicha[] {
  const entregas: EntregaFicha[] = [...filas]
    .sort((a, b) => String(a.fecha_entrega).localeCompare(String(b.fecha_entrega)))
    .map((f) => ({
      area: f.area,
      entregadoPor: f.entregado_por,
      fechaEntrega: f.fecha_entrega,
      evidenciaPath: f.evidencia_path,
    }));

  const suelta =
    sol.evidencia_path !== null &&
    !filas.some((f) => f.evidencia_path === sol.evidencia_path);

  if (suelta) {
    entregas.push({
      area: null,
      entregadoPor: sol.entregado_por,
      fechaEntrega: sol.fecha_entrega,
      evidenciaPath: sol.evidencia_path,
    });
  }

  // Ni filas de área ni foto: se devuelve un renglón vacío y no una lista
  // vacía, para que la pantalla pueda decir "sin foto registrada". Un hueco
  // silencioso se lee como un error de carga, y aquí la diferencia importa.
  if (entregas.length === 0) {
    return [{
      area: null,
      entregadoPor: sol.entregado_por,
      fechaEntrega: sol.fecha_entrega,
      evidenciaPath: null,
    }];
  }

  return entregas;
}

/** Folios válidos: SUI-000050, y los SM- anteriores a la migración 0027. */
const FOLIO_RE = /^(?:SUI|SM)-\d{6}$/;

/**
 * La ficha de una solicitud, buscada por su folio.
 *
 * Se lee con service_role porque la pantalla es de un rol interno, igual que el
 * resto del módulo. Devuelve null si el folio no existe O si viene mal formado:
 * quien pruebe cadenas no debe poder distinguir un caso del otro.
 *
 * @param folio tal como se ve en pantalla (SUI-000050).
 */
export async function fichaDeSolicitud(folio: string): Promise<FichaSolicitud | null> {
  const limpio = folio.trim().toUpperCase();
  // Se valida ANTES de tocar PostgREST: este texto viaja dentro de la URL de la
  // consulta, así que no puede ser cualquier cosa.
  if (!FOLIO_RE.test(limpio)) return null;

  const solicitudes = (await leerTablaMaterial(
    `rnd_material_solicitudes?folio=eq.${encodeURIComponent(limpio)}&select=` +
      "id,folio,sucursal,empleado_nombre,motivo,estado," +
      "autorizado_por,fecha_autorizacion,entregado_por,fecha_entrega,evidencia_path",
  )) as FilaSolicitud[];

  const sol = solicitudes?.[0];
  if (!sol) return null;

  // Las entregas cuelgan del id, no del folio: la tabla de la 0032 referencia
  // `solicitud_id`.
  const filas = (await leerTablaMaterial(
    `rnd_material_entregas_area?solicitud_id=eq.${encodeURIComponent(sol.id)}` +
      "&select=area,entregado_por,fecha_entrega,evidencia_path",
  )) as FilaArea[];

  return {
    folio: sol.folio,
    sucursal: sol.sucursal,
    empleadoNombre: sol.empleado_nombre,
    motivo: sol.motivo ?? "",
    estado: sol.estado,
    autorizadoPor: sol.autorizado_por,
    fechaAutorizacion: sol.fecha_autorizacion,
    entregas: armarEntregas(sol, filas ?? []),
  };
}
