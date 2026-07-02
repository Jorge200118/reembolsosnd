"use client";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCrearComidasLote, type ResultadoComidaLote } from "@/lib/hooks/useCrearComidasLote";
import { useReembolsos } from "@/lib/hooks/useReembolsos";
import { empleadosPorSucursal } from "@/lib/supabase/queries/empleadosPorSucursal";
import { useAuth } from "@/lib/auth/AuthContext";
import { PageHeader } from "@/components/ui/PageHeader";
import { Money } from "@/components/ui/Money";
import { EstadoBadge } from "@/components/ui/EstadoBadge";
import { parseMonto, type Estado } from "@devoluciones/domain";

type Fila = Record<string, unknown>;
type Emp = { id: number; nombre: string; sucursal: string | null; tieneTelefono: boolean };

const MONTO_COMIDA = 120;

// Normaliza para búsqueda: minúsculas + sin acentos.
function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Ícono checkbox (relleno cuando marcado).
function Check({ on }: { on: boolean }) {
  return (
    <span
      className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded border transition-colors ${
        on ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white"
      }`}
    >
      {on && (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      )}
    </span>
  );
}

export default function ComidasGerentePage() {
  const { sesion } = useAuth();
  const queryClient = useQueryClient();
  const { mutate, isPending, data: resultados, reset } = useCrearComidasLote();

  const [busqueda, setBusqueda] = useState("");
  const [seleccionados, setSeleccionados] = useState<Map<number, Emp>>(new Map());

  // Empleados de la sucursal del gerente.
  const sucursalQ = useQuery({
    queryKey: ["empleados-sucursal", sesion?.sucursal],
    queryFn: () => empleadosPorSucursal(sesion?.sucursal ?? null),
    enabled: !!sesion,
  });
  const empleadosSucursal = useMemo(() => sucursalQ.data ?? [], [sucursalQ.data]);

  // La búsqueda ACOTA la lista de la sucursal (no sugiere de otras).
  const listaFiltrada = useMemo(() => {
    const q = norm(busqueda.trim());
    if (!q) return empleadosSucursal;
    return empleadosSucursal.filter((e) => norm(e.nombre).includes(q));
  }, [empleadosSucursal, busqueda]);

  // Historial de comidas del gerente.
  const historialQ = useReembolsos({ usuarioRegistro: sesion?.email, page: 0, pageSize: 100 });
  const misComidas = useMemo(() => {
    const rows = (historialQ.data?.rows ?? []) as Fila[];
    return rows.filter((r) => String(r.concepto ?? "") === "COMIDAS");
  }, [historialQ.data]);

  const numSel = seleccionados.size;
  const totalLote = numSel * MONTO_COMIDA;

  function toggle(e: Emp) {
    reset();
    setSeleccionados((prev) => {
      const next = new Map(prev);
      if (next.has(e.id)) next.delete(e.id);
      else next.set(e.id, e);
      return next;
    });
  }

  function autorizar() {
    if (!sesion || numSel === 0) return;
    const empleados = [...seleccionados.values()];
    mutate(
      {
        empleados: empleados.map((s) => ({ id: s.id, nombre: s.nombre, sucursal: s.sucursal })),
        quienAutoriza: sesion.nombre,
        usuarioRegistro: sesion.email,
        sucursalSesion: sesion.sucursal,
      },
      {
        onSuccess: (res: ResultadoComidaLote[]) => {
          const okIds = new Set(res.filter((r) => r.ok).map((r) => r.empleadoId));
          setSeleccionados((prev) => {
            const next = new Map(prev);
            okIds.forEach((id) => next.delete(id));
            return next;
          });
          queryClient.invalidateQueries({ queryKey: ["reembolsos"] });
        },
      },
    );
  }

  const numOk = resultados?.filter((r) => r.ok).length ?? 0;
  const fallidos = resultados?.filter((r) => !r.ok) ?? [];

  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6">
      <PageHeader
        titulo="Registro de Comidas"
        subtitulo="Marca los empleados que llegaron y autoriza sus comidas de una vez · $120.00 c/u"
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
        {/* Lista de selección */}
        <div>
          {/* Buscador que ACOTA la lista de abajo */}
          <div className="relative mb-3">
            <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
            <input
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-10 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-200"
              placeholder="Filtrar por nombre…"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>

          {/* Lista densa con checkbox */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Empleados de mi sucursal</span>
              <span className="text-xs text-slate-500">
                {busqueda.trim() ? `${listaFiltrada.length} de ${empleadosSucursal.length}` : empleadosSucursal.length}
              </span>
            </div>
            {sucursalQ.isLoading ? (
              <p className="px-4 py-10 text-center text-sm text-slate-500">Cargando empleados…</p>
            ) : empleadosSucursal.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-slate-400">No hay empleados en tu sucursal.</p>
            ) : listaFiltrada.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-slate-400">Sin coincidencias para “{busqueda}”.</p>
            ) : (
              <ul className="max-h-[520px] overflow-y-auto">
                {listaFiltrada.map((e) => {
                  const on = seleccionados.has(e.id);
                  return (
                    <li key={e.id}>
                      <button
                        type="button"
                        onClick={() => toggle(e)}
                        className={`flex w-full items-center gap-3 border-b border-slate-100 px-4 py-2.5 text-left text-sm transition-colors last:border-0 ${on ? "bg-blue-50/70" : "hover:bg-slate-50"}`}
                      >
                        <Check on={on} />
                        <span className="flex-1 font-medium text-slate-900">{e.nombre}</span>
                        {!e.tieneTelefono && (
                          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">sin teléfono</span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Panel lateral: resumen del lote */}
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">Por autorizar</h2>
              {numSel > 0 && (
                <button onClick={() => { setSeleccionados(new Map()); reset(); }} className="text-xs font-medium text-slate-500 hover:text-slate-700">
                  Limpiar
                </button>
              )}
            </div>

            {numSel === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">Marca empleados en la lista.</p>
            ) : (
              <ul className="mb-3 max-h-52 space-y-1 overflow-y-auto">
                {[...seleccionados.values()].map((s) => (
                  <li key={s.id} className="flex items-center justify-between rounded-md bg-slate-50 px-2.5 py-1.5 text-sm">
                    <span className="truncate text-slate-800">{s.nombre}</span>
                    <button onClick={() => toggle(s)} className="ml-2 shrink-0 text-slate-400 hover:text-red-600" title="Quitar">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-sm">
              <span className="text-slate-600">Autoriza</span>
              <span className="font-medium text-slate-900">{sesion?.nombre ?? "—"}</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-sm">
              <span className="text-slate-600">Total ({numSel})</span>
              <span className="font-bold tabular-nums text-slate-900">${totalLote.toLocaleString("es-MX", { minimumFractionDigits: 2 })}</span>
            </div>

            {resultados && (
              <div className="mt-3 space-y-2">
                {numOk > 0 && <p className="rounded-md bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-700">{numOk} comida(s) autorizada(s)</p>}
                {fallidos.length > 0 && (
                  <div className="rounded-md bg-red-50 px-2.5 py-1.5 text-xs text-red-700">
                    {fallidos.length} no se registró:
                    <ul className="mt-0.5 list-disc pl-4">
                      {fallidos.map((f) => <li key={f.empleadoId}>{f.nombre}: {f.error}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={autorizar}
              disabled={isPending || numSel === 0 || !sesion}
              className="mt-4 w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-40"
            >
              {isPending ? "Registrando…" : numSel === 0 ? "Autorizar comidas" : `Autorizar ${numSel} comida${numSel > 1 ? "s" : ""}`}
            </button>
          </div>
        </aside>
      </div>

      {/* Historial */}
      <div className="mt-8">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Comidas autorizadas por ti</h2>
          <span className="text-xs text-slate-500">{misComidas.length}</span>
        </div>
        {historialQ.isLoading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">Cargando…</div>
        ) : misComidas.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400 shadow-sm">No has autorizado comidas aún.</div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Beneficiario</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Fecha</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Monto</th>
                    <th className="px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {misComidas.map((r) => (
                    <tr key={String(r.id)} className="border-b border-slate-100 last:border-0 hover:bg-blue-50/40">
                      <td className="px-4 py-2.5 font-medium text-slate-900">{String(r.nombre_beneficiario ?? "")}</td>
                      <td className="px-4 py-2.5 text-slate-600">{r.fecha ? new Date(String(r.fecha) + "T12:00:00").toLocaleDateString("es-MX") : "—"}</td>
                      <td className="px-4 py-2.5 text-right"><Money monto={parseMonto(r.monto as number)} /></td>
                      <td className="px-4 py-2.5 text-center"><EstadoBadge estado={r.estado as Estado} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
