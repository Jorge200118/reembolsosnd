"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listarCajeras } from "@/lib/supabase/queries/cajeras";
import { useComidasPendientes } from "@/lib/hooks/useComidasPendientes";
import { OtpCapturaModal } from "@/components/comidas/OtpCapturaModal";
import { Money } from "@/components/ui/Money";

export default function PagoComidasPage() {
  // null = la cajera aún no eligió manualmente → se preselecciona la primera.
  const [cajeraElegida, setCajeraElegida] = useState<string | null>(null);
  const [modalChofer, setModalChofer] = useState<{ empleadoId: number; nombre: string } | null>(null);
  const queryClient = useQueryClient();

  const { data: cajeras } = useQuery({ queryKey: ["cajeras"], queryFn: listarCajeras });
  const { data: comidas, isLoading } = useComidasPendientes();

  // Selección efectiva derivada: la elección explícita o, si no hay, la primera cajera.
  const cajeraEmail = cajeraElegida ?? (cajeras && cajeras.length > 0 ? cajeras[0]!.email : "");

  function onExitoPago() {
    setModalChofer(null);
    queryClient.invalidateQueries({ queryKey: ["comidas-pendientes"] });
  }

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-1 text-2xl font-bold text-slate-800">Pago de Comidas</h1>
      <p className="mb-6 text-sm text-slate-500">El chofer recibe su código por WhatsApp · captúralo para liberar el pago</p>

      <div className="mb-6">
        <label className="mb-1 block text-sm font-medium text-slate-600">Cajera</label>
        <select
          className="rounded-lg border px-3 py-2"
          value={cajeraEmail}
          onChange={(e) => setCajeraElegida(e.target.value)}
        >
          <option value="">Selecciona…</option>
          {(cajeras ?? []).map((c) => (
            <option key={c.email} value={c.email}>{c.nombre}</option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <p className="text-slate-400">Cargando comidas…</p>
      ) : (comidas ?? []).length === 0 ? (
        <p className="rounded-lg bg-slate-50 p-6 text-center text-slate-400">No hay comidas pendientes de pago.</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border">
          <table className="w-full">
            <thead className="bg-slate-50 text-left text-sm text-slate-600">
              <tr>
                <th className="p-3">Chofer</th>
                <th className="p-3 text-center">Comidas</th>
                <th className="p-3 text-right">Total</th>
                <th className="p-3 text-center">Acción</th>
              </tr>
            </thead>
            <tbody>
              {(comidas ?? []).map((c) => (
                <tr key={`${c.empleadoId}-${c.nombre}`} className="border-t">
                  <td className="p-3 font-medium">{c.nombre}</td>
                  <td className="p-3 text-center">{c.numComidas}</td>
                  <td className="p-3 text-right"><Money monto={c.total} /></td>
                  <td className="p-3 text-center">
                    {c.estatus === "ok" && c.empleadoId != null ? (
                      <button
                        className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
                        disabled={cajeraEmail === ""}
                        onClick={() => setModalChofer({ empleadoId: c.empleadoId as number, nombre: c.nombre })}
                      >
                        Cobrar con código
                      </button>
                    ) : (
                      <span className="text-xs text-amber-600">
                        {c.estatus === "sin_telefono" ? "Sin teléfono" : "Sin empleado vinculado"}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalChofer && (
        <OtpCapturaModal
          empleadoId={modalChofer.empleadoId}
          empleadoNombre={modalChofer.nombre}
          cajeraEmail={cajeraEmail}
          onClose={() => setModalChofer(null)}
          onExito={onExitoPago}
        />
      )}
    </main>
  );
}
