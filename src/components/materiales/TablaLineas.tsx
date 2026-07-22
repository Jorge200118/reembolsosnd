"use client";
import { Money } from "@/components/ui/Money";
import { parseMonto } from "@devoluciones/domain";
import type { LineaGuardada } from "@/lib/materiales/totales";

export function TablaLineas({
  lineas,
  capturable,
  entregas,
  onCambiar,
}: {
  lineas: LineaGuardada[];
  /** true en la pantalla de almacén, cuando la solicitud está autorizada. */
  capturable: boolean;
  /** Mapa lineaId -> cantidad que se va a entregar (solo en modo captura). */
  entregas: Record<string, number>;
  onCambiar: (lineaId: string, cantidad: number) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="pb-1.5 pr-4">Material</th>
            <th className="pb-1.5 pr-4">Código</th>
            <th className="pb-1.5 pr-4 text-right">Pedido</th>
            <th className="pb-1.5 pr-4 text-right">Existencia</th>
            <th className="pb-1.5 pr-4 text-right">Costo</th>
            <th className="pb-1.5 text-right">{capturable ? "Entregar" : "Entregado"}</th>
          </tr>
        </thead>
        <tbody>
          {lineas.map((l) => {
            const corto = l.existencia_al_pedir !== null && l.cantidad > l.existencia_al_pedir;
            return (
              <tr key={l.id} className="border-t border-slate-200">
                <td className="py-1.5 pr-4 text-slate-900">{l.descripcion}</td>
                <td className="py-1.5 pr-4 text-slate-600">{l.cod_prod}</td>
                <td className="py-1.5 pr-4 text-right text-slate-900">
                  {l.cantidad}
                  {l.unidad ? ` ${l.unidad}` : ""}
                </td>
                <td
                  className={`py-1.5 pr-4 text-right ${corto ? "font-semibold text-amber-700" : "text-slate-600"}`}
                  title={
                    !corto
                      ? undefined
                      : (l.existencia_al_pedir ?? 0) <= 0
                        ? `No había existencia (el ERP marcaba ${l.existencia_al_pedir})`
                        : `Se pidieron ${l.cantidad} y solo había ${l.existencia_al_pedir}`
                  }
                >
                  {l.existencia_al_pedir === null ? "—" : l.existencia_al_pedir}
                </td>
                <td className="py-1.5 pr-4 text-right text-slate-600">
                  {l.costo_unitario === null ? "—" : <Money monto={parseMonto(l.costo_unitario)} />}
                </td>
                <td className="py-1.5 text-right">
                  {capturable ? (
                    <input
                      type="number"
                      min={0}
                      max={l.cantidad}
                      aria-label={`Entregado de ${l.descripcion}`}
                      value={entregas[l.id] ?? l.cantidad}
                      onChange={(e) => onCambiar(l.id, Number(e.target.value))}
                      className="w-20 rounded-md border border-slate-300 px-2 py-1 text-right text-sm"
                    />
                  ) : l.cantidad_entregada === null ? (
                    <span className="text-slate-400">—</span>
                  ) : (
                    <span className="text-slate-900">
                      {l.cantidad_entregada} de {l.cantidad}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
