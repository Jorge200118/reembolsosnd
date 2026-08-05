import type { ConfigSegmentos } from "@/lib/filtros/segmentar";
import type { SolicitudGuardada } from "./totales";

// Cómo se segmenta una lista de solicitudes de uso interno. Vive aquí y no en
// cada pantalla porque el gerente y el almacén miran las MISMAS solicitudes:
// si los criterios se escribieran dos veces, en un mes serían distintos.
//
// A propósito NO hay segmentador de "estado": las pestañas de esas pantallas
// (Pendientes/Historial, Por surtir/En espera/Entregadas) ya son ese filtro, y
// repetirlo daría un desplegable con una sola opción dentro de cada pestaña.
//
// Constante a nivel de módulo, no una función: `useSegmentadores` la usa como
// dependencia de un `useMemo`, y un objeto nuevo por render lo invalidaría
// siempre.
export const FILTROS_SOLICITUDES: ConfigSegmentos<SolicitudGuardada> = {
  segmentos: [
    { id: "sucursal", etiqueta: "Sucursal", de: (s) => s.sucursal },
    {
      id: "area",
      etiqueta: "Área",
      // Multivaluado: una solicitud toca todas las áreas de sus renglones, y
      // filtrar por NAVE2 tiene que encontrarla aunque la mayoría sea de
      // Ferretería.
      de: (s) => [...new Set(s.rnd_material_lineas.map((l) => l.area).filter((a): a is NonNullable<typeof a> => a !== null))],
      orden: ["FERRETERIA", "NAVE1", "NAVE2", "NAVE3"],
    },
    // Null en las pendientes (todavía nadie autoriza), así que en esa pestaña
    // el desplegable se queda sin opciones y no se dibuja. Se cae solo.
    { id: "autorizo", etiqueta: "Autorizó", de: (s) => s.autorizado_por },
  ],
  // Se busca también dentro de los renglones: quien pregunta "¿quién pidió
  // cemento?" teclea el producto, no el folio.
  buscarEn: (s) =>
    [
      s.folio,
      s.empleado_nombre,
      s.motivo,
      ...s.rnd_material_lineas.map((l) => `${l.cod_prod} ${l.descripcion}`),
    ].join(" "),
  // Cuándo el empleado levantó la solicitud, no cuándo se autorizó ni cuándo se
  // entregó: es la fecha que el usuario recuerda ("la pedí el martes").
  fechaDe: (s) => s.creado_en,
  etiquetaFecha: "Pedido",
};
