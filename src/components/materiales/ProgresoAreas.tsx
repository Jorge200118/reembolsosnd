"use client";
import { etiquetaArea } from "@devoluciones/domain";
import type { AvanceArea } from "@/lib/materiales/totales";

// "2 de 3 áreas entregadas", con el detalle de cuál falta. Sin esto, una
// solicitud a medio surtir se ve igual que una intacta y nadie sabe a quién
// apurar.
//
// Va en la cabecera de la tarjeta, dentro de su flex de chips: por eso usa un
// Fragment y no un div propio, y por eso no trae márgenes. El objetivo es
// barrer la lista y ver de un golpe a quién le falta entregar; metido en el
// detalle obligaría a abrir tarjeta por tarjeta, que es el trabajo que ahorra.

export function ProgresoAreas({ avance }: { avance: AvanceArea[] }) {
  if (avance.length <= 1) return null; // una sola área: no hay nada que repartir

  const listas = avance.filter((a) => a.completa).length;

  return (
    <>
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
    </>
  );
}
