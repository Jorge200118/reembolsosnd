// Fuente: mapa nombresSucursales en el HTML viejo (LMM, JJR, CLN, FTE, SJC, CSL, TML, LPZ).
export interface Sucursal {
  codigo: string;
  nombre: string;
}

export const SUCURSALES = [
  { codigo: "LMM", nombre: "Los Mochis" },
  { codigo: "JJR", nombre: "Juan José Ríos" },
  { codigo: "CLN", nombre: "Culiacán" },
  { codigo: "FTE", nombre: "El Fuerte" },
  { codigo: "SJC", nombre: "San José del Cabo" },
  { codigo: "CSL", nombre: "Cabo San Lucas" },
  { codigo: "TML", nombre: "Tamaral" },
  { codigo: "LPZ", nombre: "La Paz" },
] as const satisfies readonly Sucursal[];

export type SucursalCodigo = (typeof SUCURSALES)[number]["codigo"];
