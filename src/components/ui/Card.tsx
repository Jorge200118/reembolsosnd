import type { ReactNode } from "react";

// Tarjeta base: fondo blanco, borde sutil y sombra suave. La unidad visual
// que agrupa contenido en toda la app.
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {children}
    </div>
  );
}
