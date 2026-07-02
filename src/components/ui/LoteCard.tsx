"use client";
import { useState, type ReactNode } from "react";
import { Chip } from "@/components/ui/Chip";
import { Money } from "@/components/ui/Money";
import { parseMonto } from "@devoluciones/domain";

export interface LoteCardProps {
  lote: string;
  sucursal?: string;
  numeroSolicitud?: string | null;
  numReembolsos: number;
  total: number;
  acentoColor: string;      // clase border-l, ej "border-l-emerald-500"
  chipTono: "verde" | "ambar" | "cyan";
  accion?: ReactNode;       // botón principal (ej. Solicitar entrega)
  detalle: ReactNode;       // contenido expandible (tabla)
}

// Tarjeta de lote con borde izquierdo de color, resumen y detalle expandible.
// Reutilizada en Entregas y Reportes (vista por lotes).
export function LoteCard({
  lote, sucursal, numeroSolicitud, numReembolsos, total, acentoColor, chipTono, accion, detalle,
}: LoteCardProps) {
  const [abierto, setAbierto] = useState(false);
  return (
    <div className={`overflow-hidden rounded-xl border border-slate-200 border-l-4 bg-white shadow-sm ${acentoColor}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-sm font-bold text-slate-900">Lote {lote}</span>
          {sucursal && <Chip tono={chipTono}>{sucursal}</Chip>}
          <span className="text-sm text-slate-600">{numReembolsos} reembolsos</span>
          <span className="text-sm font-semibold text-slate-900">
            Total <Money monto={parseMonto(total)} />
          </span>
          {numeroSolicitud && <span className="text-xs text-slate-500">Solicitud {numeroSolicitud}</span>}
        </div>
        <div className="flex items-center gap-2">
          {accion}
          <button
            onClick={() => setAbierto((v) => !v)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            {abierto ? "Ocultar" : "Ver detalle"}
          </button>
        </div>
      </div>
      {abierto && <div className="border-t border-slate-100 bg-slate-50/50 p-4">{detalle}</div>}
    </div>
  );
}
