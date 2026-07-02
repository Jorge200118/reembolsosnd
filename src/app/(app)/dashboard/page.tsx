"use client";
import { useQuery } from "@tanstack/react-query";
import { resumenPorEstado } from "@/lib/supabase/queries/dashboard";
import { Money } from "@/components/ui/Money";
import { PageHeader } from "@/components/ui/PageHeader";
import { labelEstado, type Estado } from "@devoluciones/domain";

// Acento por estado (texto + barra), coherente con EstadoBadge.
const ACENTO: Record<string, { barra: string; texto: string }> = {
  pendiente: { barra: "bg-amber-500", texto: "text-amber-600" },
  en_corte: { barra: "bg-blue-500", texto: "text-blue-600" },
  aprobado: { barra: "bg-emerald-500", texto: "text-emerald-600" },
  rechazado: { barra: "bg-red-500", texto: "text-red-600" },
  solicitado_entrega: { barra: "bg-cyan-500", texto: "text-cyan-600" },
  entregado: { barra: "bg-slate-500", texto: "text-slate-600" },
  comida_pendiente: { barra: "bg-yellow-500", texto: "text-yellow-600" },
};

export default function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-estados"],
    queryFn: resumenPorEstado,
  });

  const filas = data ?? [];
  const totalReembolsos = filas.reduce((s, r) => s + r.cantidad, 0);
  const montoTotal = filas.reduce((s, r) => s + Number(r.total), 0);
  const maxCantidad = Math.max(1, ...filas.map((r) => r.cantidad));

  return (
    <main className="mx-auto max-w-6xl p-6">
      <PageHeader titulo="Dashboard" subtitulo="Resumen de reembolsos por estado" />

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-lg border border-slate-200 bg-white" />)}
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-lg border border-slate-200 bg-white" />)}
          </div>
        </div>
      ) : (
        <>
          {/* KPIs ejecutivos */}
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Total de reembolsos</div>
              <div className="mt-1 text-3xl font-bold tabular-nums text-slate-900">{totalReembolsos.toLocaleString("es-MX")}</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Monto total</div>
              <div className="mt-1 text-3xl font-bold tabular-nums text-slate-900">${montoTotal.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            </div>
          </div>

          {/* Desglose por estado */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {filas.map((r) => {
              const ac = ACENTO[r.estado] ?? { barra: "bg-slate-400", texto: "text-slate-600" };
              const pct = totalReembolsos > 0 ? Math.round((r.cantidad / totalReembolsos) * 100) : 0;
              return (
                <div
                  key={r.estado}
                  className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      {labelEstado(r.estado as Estado)}
                    </span>
                    <span className={`text-[11px] font-semibold tabular-nums ${ac.texto}`}>{pct}%</span>
                  </div>
                  <div className="mt-1.5 flex items-baseline justify-between gap-2">
                    <span className="text-2xl font-bold tabular-nums text-slate-900">{r.cantidad.toLocaleString("es-MX")}</span>
                    <span className="text-sm font-medium tabular-nums text-slate-600"><Money monto={r.total} /></span>
                  </div>
                  {/* mini-barra de proporción */}
                  <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className={`h-full rounded-full ${ac.barra}`} style={{ width: `${Math.max(4, (r.cantidad / maxCantidad) * 100)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </main>
  );
}
