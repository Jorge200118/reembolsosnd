import type { ReactNode } from "react";

type Tono = "azul" | "verde" | "ambar" | "cyan" | "slate" | "morado";

const TONOS: Record<Tono, string> = {
  azul: "bg-blue-50 text-blue-700",
  verde: "bg-emerald-50 text-emerald-700",
  ambar: "bg-amber-50 text-amber-700",
  cyan: "bg-cyan-50 text-cyan-700",
  slate: "bg-slate-100 text-slate-700",
  morado: "bg-violet-50 text-violet-700",
};

// Etiqueta pequeña de color (sucursal, conteo, etc.).
export function Chip({ children, tono = "slate" }: { children: ReactNode; tono?: Tono }) {
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${TONOS[tono]}`}>
      {children}
    </span>
  );
}
