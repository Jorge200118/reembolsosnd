"use client";
import { etiquetaArea } from "@devoluciones/domain";
import type { AvanceArea } from "@/lib/materiales/totales";

// "2 de 3 áreas entregadas", con el detalle de cuál falta. Sin esto, una
// solicitud a medio surtir se ve igual que una intacta y nadie sabe a quién
// apurar.

export function ProgresoAreas({ avance }: { avance: AvanceArea[] }) {
  if (avance.length <= 1) return null; // una sola área: no hay nada que repartir

  const listas = avance.filter((a) => a.completa).length;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-medium text-slate-600">
        {listas} de {avance.length} áreas entregadas
      </span>
      {avance.map((a) => (
        <span
          key={a.area}
          className={
            a.completa
              ? "rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800"
              : "rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
          }
          title={`${a.entregadas} de ${a.total} materiales`}
        >
          {a.completa ? "✓" : "○"} {etiquetaArea(a.area)}
        </span>
      ))}
    </div>
  );
}
