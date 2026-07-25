// Áreas que entregan material de uso interno. Hoy solo aplica a Los Mochis;
// las demás sucursales tienen un único encargado que entrega todo.
//
// El área NO existe como columna en el ERP: se deriva del NOMBRE de la zona de
// inventario físico (BMSCabos.dbo.zonas_inventario_fisico.nombre). Se deriva del
// nombre y NUNCA del código de zona, porque en Mochis los códigos mienten: la
// zona con código 'A5' se llama "N1 P2 IZQ" y la 'N2P8DER' se llama "N3 LINEAL".

export const AREAS = ["FERRETERIA", "NAVE1", "NAVE2", "NAVE3"] as const;
export type Area = (typeof AREAS)[number];

const ETIQUETAS: Record<Area, string> = {
  FERRETERIA: "Ferretería",
  NAVE1: "Nave 1",
  NAVE2: "Nave 2",
  NAVE3: "Nave 3",
};

export function etiquetaArea(a: Area): string {
  return ETIQUETAS[a];
}

export function esArea(v: unknown): v is Area {
  return typeof v === "string" && (AREAS as readonly string[]).includes(v);
}

/**
 * Deriva el área a partir del nombre de la zona de inventario físico.
 *
 * El patio (N0) se le asigna a Nave 1: son 27 productos y el encargado de
 * Nave 1 es quien los surte.
 *
 * Devuelve null si no hay zona. Un producto sin zona en BMS no se puede pedir
 * (decisión del negocio): quien llame trata el null como bloqueo, no como
 * "ponlo en ferretería".
 */
export function areaDeZona(nombreZona: string | null | undefined): Area | null {
  const z = String(nombreZona ?? "").trim().toUpperCase();
  if (!z) return null;

  // El dígito es obligatorio: así "NAVEGACION" o "NORTE" no se cuelan como nave.
  const m = /^N([0-3])(?![0-9])/.exec(z);
  if (!m) return "FERRETERIA";

  switch (m[1]) {
    case "0": return "NAVE1"; // patio
    case "1": return "NAVE1";
    case "2": return "NAVE2";
    default:  return "NAVE3";
  }
}
