"use client";
import { useState, type ReactNode } from "react";
import { Chip } from "@/components/ui/Chip";
import { Money } from "@/components/ui/Money";
import { parseMonto } from "@devoluciones/domain";
import { ProgresoAreas } from "@/components/materiales/ProgresoAreas";
import {
  totalDeLineas,
  lineasSinCosto,
  resumenPorArea,
  type SolicitudGuardada,
} from "@/lib/materiales/totales";

// Hermana de LoteCard, con el vocabulario de material. No se reusó LoteCard
// porque tiene "Lote X" y "N reembolsos" escritos a mano.

const TONO_ESTADO: Record<string, "verde" | "ambar" | "cyan"> = {
  pendiente: "ambar",
  autorizada: "cyan",
  entregada: "verde",
  rechazada: "ambar",
  cancelada: "ambar",
};

export function SolicitudCard({
  solicitud,
  acentoColor,
  accion,
  detalle,
}: {
  solicitud: SolicitudGuardada;
  acentoColor: string;
  accion?: ReactNode;
  detalle: ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);
  const s = solicitud;
  const n = s.rnd_material_lineas.length;
  const sinCosto = lineasSinCosto(s.rnd_material_lineas);
  const avance = resumenPorArea(s.rnd_material_lineas);

  return (
    <div className={`overflow-hidden rounded-xl border border-slate-200 border-l-4 bg-white shadow-sm ${acentoColor}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-sm font-bold text-slate-900">{s.folio}</span>
          <Chip tono={TONO_ESTADO[s.estado] ?? "ambar"}>{s.sucursal}</Chip>
          <span className="text-sm text-slate-700">{s.empleado_nombre}</span>
          <span className="text-sm text-slate-600">
            {n} material{n !== 1 ? "es" : ""}
          </span>
          {sinCosto === n ? (
            // Cero por falta de dato no es cero: decirlo con letras evita que
            // el gerente autorice creyendo que no cuesta nada.
            <span className="text-sm font-semibold text-slate-500">Sin costo en el catálogo</span>
          ) : (
            <span className="text-sm font-semibold text-slate-900">
              Estimado <Money monto={parseMonto(totalDeLineas(s.rnd_material_lineas))} />
              {sinCosto > 0 && (
                <span className="ml-1 font-normal text-amber-700">
                  (+{sinCosto} sin costo)
                </span>
              )}
            </span>
          )}
          <span className="text-xs text-slate-500">
            {new Date(s.creado_en).toLocaleDateString("es-MX")}
          </span>
          {s.nota && <span className="text-xs italic text-slate-500">“{s.nota}”</span>}
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
      {abierto && (
        <div className="border-t border-slate-100 bg-slate-50/50 p-4">
          {s.evidencia_path && (
            <p className="mb-2 text-xs text-slate-500">
              Código verificado{" "}
              {s.codigo_usado_en ? new Date(s.codigo_usado_en).toLocaleString("es-MX") : ""} ·{" "}
              <a
                href={`/api/materiales/evidencia?id=${s.id}&redirigir=1`}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-blue-700 underline"
              >
                Ver foto de la entrega
              </a>
            </p>
          )}
          <ProgresoAreas avance={avance} />
          {detalle}
        </div>
      )}
    </div>
  );
}
