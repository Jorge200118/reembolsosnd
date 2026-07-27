export const ROLES = ["admin", "caja_chica", "gerente", "autorizador", "almacen", "inventarios"] as const;
export type Rol = (typeof ROLES)[number];

export type TabId =
  | "nuevo-reembolso"
  | "revision"
  | "entregas"
  | "reportes"
  | "dashboard"
  | "comidas-gerente"
  | "pago-comidas"
  | "autorizaciones"
  | "materiales-gerente"
  | "materiales-almacen"
  | "inventarios";

/**
 * Normaliza el rol crudo de rnd_usuarios. 'administracion' era un rol roto
 * en el HTML viejo (no aparecía en ningún data-role → no veía nada); se trata
 * como alias de admin. Cualquier valor desconocido cae a caja_chica (mínimo privilegio).
 */
export function normalizarRol(raw: string): Rol {
  const r = raw.trim().toLowerCase();
  if (r === "administracion" || r === "admin") return "admin";
  if (r === "gerente") return "gerente";
  if (r === "autorizador") return "autorizador";
  if (r === "almacen" || r === "almacén") return "almacen";
  if (r === "inventarios" || r === "inventario") return "inventarios";
  return "caja_chica";
}

export const ROL_TABS: Record<Rol, readonly TabId[]> = {
  admin: [
    "nuevo-reembolso",
    "revision",
    "entregas",
    "reportes",
    "dashboard",
  ],
  caja_chica: ["nuevo-reembolso", "revision", "reportes", "pago-comidas"],
  gerente: ["comidas-gerente", "materiales-gerente"],
  autorizador: ["autorizaciones"],
  almacen: ["materiales-almacen"],
  // Aparte de almacén a propósito: quien surte el material no es quien lo
  // descarga del ERP. Separarlos deja el rastro de quién afectó el inventario.
  inventarios: ["inventarios"],
};

export function tabsDeRol(rol: Rol): readonly TabId[] {
  return ROL_TABS[rol];
}
