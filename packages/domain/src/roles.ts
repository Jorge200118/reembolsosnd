export const ROLES = ["admin", "caja_chica", "gerente"] as const;
export type Rol = (typeof ROLES)[number];

export type TabId =
  | "nuevo-reembolso"
  | "revision"
  | "entregas"
  | "reportes"
  | "dashboard"
  | "comidas-gerente"
  | "pago-comidas";

/**
 * Normaliza el rol crudo de rnd_usuarios. 'administracion' era un rol roto
 * en el HTML viejo (no aparecía en ningún data-role → no veía nada); se trata
 * como alias de admin. Cualquier valor desconocido cae a caja_chica (mínimo privilegio).
 */
export function normalizarRol(raw: string): Rol {
  const r = raw.trim().toLowerCase();
  if (r === "administracion" || r === "admin") return "admin";
  if (r === "gerente") return "gerente";
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
  gerente: ["comidas-gerente"],
};

export function tabsDeRol(rol: Rol): readonly TabId[] {
  return ROL_TABS[rol];
}
