"use client";
import { useQuery } from "@tanstack/react-query";
import { resumenPorEstado } from "@/lib/supabase/queries/dashboard";
import { Money } from "@/components/ui/Money";
import { labelEstado, type Estado } from "@devoluciones/domain";

export default function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-estados"],
    queryFn: resumenPorEstado,
  });

  return (
    <main className="p-6">
      <h1 className="mb-4 text-2xl font-bold text-slate-800">Dashboard</h1>
      {isLoading ? (
        <p className="text-slate-400">Cargando…</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          {(data ?? []).map((r) => (
            <div key={r.estado} className="rounded-xl border p-4 shadow-sm">
              <div className="text-sm text-slate-500">
                {labelEstado(r.estado as Estado)}
              </div>
              <div className="text-2xl font-bold">{r.cantidad}</div>
              <div className="text-sm text-slate-600">
                <Money monto={r.total} />
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
