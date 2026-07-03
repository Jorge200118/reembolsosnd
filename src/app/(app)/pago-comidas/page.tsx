"use client";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useComidasPendientes } from "@/lib/hooks/useComidasPendientes";
import { OtpCapturaModal } from "@/components/comidas/OtpCapturaModal";
import { useAuth } from "@/lib/auth/AuthContext";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { Money } from "@/components/ui/Money";

export default function PagoComidasPage() {
  const { sesion } = useAuth();
  const cajeraEmail = sesion?.email ?? "";
  const [modalChofer, setModalChofer] = useState<{ empleadoId: number; nombre: string } | null>(null);
  const queryClient = useQueryClient();
  const { data: comidas, isLoading } = useComidasPendientes();

  const diaSemana = new Date().getDay();
  const esDiaHabil = diaSemana >= 1 && diaSemana <= 5;
  const lista = comidas ?? [];
  const totalGeneral = lista.reduce((s, c) => s + Number(c.total), 0);
  const totalComidas = lista.reduce((s, c) => s + c.numComidas, 0);

  function onExitoPago() {
    setModalChofer(null);
    queryClient.invalidateQueries({ queryKey: ["comidas-pendientes"] });
  }

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6">
      <PageHeader titulo="Pago de Comidas" subtitulo="Comidas autorizadas pendientes de pago · el chofer recibe su código por WhatsApp" />

      <div className="mb-4 inline-flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-1 text-xs text-blue-800">
        <span className="font-semibold uppercase tracking-wide">Cajera:</span> {sesion?.nombre ?? "—"}
      </div>

      {!esDiaHabil && (
        <Card className="mb-4 border-l-4 border-l-red-400 bg-red-50 p-4 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="text-2xl">🔒</span>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-red-700">Pagos deshabilitados</div>
              <div className="text-sm text-red-600 break-words">Los pagos de comidas solo se pueden realizar de <strong>lunes a viernes</strong>.</div>
            </div>
          </div>
        </Card>
      )}

      {isLoading ? (
        <Card className="p-6 text-center text-slate-500 sm:p-10">Cargando comidas…</Card>
      ) : lista.length === 0 ? (
        <Card className="p-6 text-center text-slate-500 sm:p-10">No hay comidas pendientes de pago.</Card>
      ) : (
        <>
          <Card className="mb-4 border-l-4 border-l-emerald-400 bg-emerald-50/50 p-4 sm:p-6">
            <div className="flex flex-wrap items-center gap-x-2 text-sm text-slate-700">
              <strong className="text-slate-900">{totalComidas}</strong> comidas de
              <strong className="text-slate-900">{lista.length}</strong> empleados ·
              <span className="font-semibold text-slate-900"><Money monto={String(totalGeneral)} /></span> total
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Chofer</th>
                    <th className="px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">Comidas</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Total</th>
                    <th className="px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((c) => (
                    <tr key={`${c.empleadoId}-${c.nombre}`} className="border-b border-slate-100 last:border-0 hover:bg-blue-50/40">
                      <td className="px-4 py-2.5 font-medium text-slate-900">{c.nombre}</td>
                      <td className="px-4 py-2.5 text-center tabular-nums text-slate-900">{c.numComidas}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums"><Money monto={c.total} /></td>
                      <td className="px-4 py-2.5 text-center">
                        {c.estatus === "ok" && c.empleadoId != null ? (
                          <button
                            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-40"
                            disabled={cajeraEmail === "" || !esDiaHabil}
                            title={!esDiaHabil ? "Solo de lunes a viernes" : undefined}
                            onClick={() => setModalChofer({ empleadoId: c.empleadoId as number, nombre: c.nombre })}
                          >
                            Cobrar con código
                          </button>
                        ) : (
                          <Chip tono="ambar">{c.estatus === "sin_telefono" ? "Sin teléfono" : "Sin empleado"}</Chip>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
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
