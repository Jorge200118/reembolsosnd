"use client";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useReembolsos } from "@/lib/hooks/useReembolsos";
import { useAutorizarLote, useRechazarLote } from "@/lib/hooks/useAutorizacion";
import { agruparPorLote, type Fila, type GrupoLote } from "@/lib/reportes/agruparPorLote";
import { useAuth } from "@/lib/auth/AuthContext";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { LoteCard } from "@/components/ui/LoteCard";
import { Money } from "@/components/ui/Money";
import { parseMonto, normalizarArchivos } from "@devoluciones/domain";

const BTN_OK = "rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-40";
const BTN_NO = "rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-40";

function TablaDetalle({ reembolsos }: { reembolsos: Fila[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="pb-1.5 pr-4">Beneficiario</th>
            <th className="pb-1.5 pr-4">Concepto</th>
            <th className="pb-1.5 pr-4 text-right">Monto</th>
            <th className="pb-1.5 pr-4">Fecha</th>
            <th className="pb-1.5">Comprobantes</th>
          </tr>
        </thead>
        <tbody>
          {reembolsos.map((r) => {
            const archivos = normalizarArchivos(r.archivos);
            return (
              <tr key={String(r.id)} className="border-t border-slate-200">
                <td className="py-1.5 pr-4 text-slate-900">{String(r.nombre_beneficiario ?? "")}</td>
                <td className="py-1.5 pr-4 text-slate-600">{String(r.concepto ?? "")}</td>
                <td className="py-1.5 pr-4 text-right"><Money monto={parseMonto(r.monto as number)} /></td>
                <td className="py-1.5 pr-4 text-slate-600">{r.fecha ? new Date(String(r.fecha) + "T12:00:00").toLocaleDateString("es-MX") : "—"}</td>
                <td className="py-1.5">
                  {archivos.length === 0 ? (
                    <span className="text-slate-400">—</span>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {archivos.map((a, i) => (
                        <a key={i} href={a.url} target="_blank" rel="noopener noreferrer"
                           className="rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100">
                          Ver {archivos.length > 1 ? i + 1 : ""}
                        </a>
                      ))}
                    </div>
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

export default function AutorizacionesPage() {
  const { sesion } = useAuth();
  const enCorteQ = useReembolsos({ estado: "en_corte", page: 0, pageSize: 500 });
  const autorizar = useAutorizarLote();
  const rechazar = useRechazarLote();
  const queryClient = useQueryClient();
  const [msg, setMsg] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [motivoAbierto, setMotivoAbierto] = useState<Record<string, boolean>>({});
  const [motivoPorLote, setMotivoPorLote] = useState<Record<string, string>>({});

  const enCorte = useMemo(() => (enCorteQ.data?.rows ?? []) as Fila[], [enCorteQ.data]);
  const lotes = useMemo(() => agruparPorLote(enCorte, "numero_lote"), [enCorte]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return lotes;
    return lotes.filter((g) => {
      const benef = g.reembolsos.map((r) => String(r.nombre_beneficiario ?? "").toLowerCase()).join(" ");
      return g.lote.toLowerCase().includes(q) || g.sucursal.toLowerCase().includes(q) || benef.includes(q);
    });
  }, [busqueda, lotes]);

  function refrescar() {
    queryClient.invalidateQueries({ queryKey: ["reembolsos"] });
  }

  function onAutorizar(g: GrupoLote) {
    if (!confirm(`¿Autorizar el lote ${g.lote}?\n\n${g.reembolsos.length} reembolsos · Total $${g.total.toLocaleString()}`)) return;
    const ids = g.reembolsos.map((r) => String(r.id));
    setMsg("");
    autorizar.mutate({ ids, autorizadoPor: sesion?.nombre ?? "Autorizador" }, {
      onSuccess: (res) => {
        setMsg(res.ok ? `✅ Lote ${g.lote} autorizado (${res.actualizados} reembolsos)` : `⚠ ${res.error}`);
        if (res.ok) refrescar();
      },
    });
  }

  function onRechazar(g: GrupoLote) {
    const ids = g.reembolsos.map((r) => String(r.id));
    setMsg("");
    rechazar.mutate({ ids, autorizadoPor: sesion?.nombre ?? "Autorizador", motivo: motivoPorLote[g.lote] }, {
      onSuccess: (res) => {
        setMsg(res.ok ? `Lote ${g.lote} rechazado (${res.actualizados} reembolsos)` : `⚠ ${res.error}`);
        if (res.ok) { setMotivoAbierto((p) => ({ ...p, [g.lote]: false })); refrescar(); }
      },
    });
  }

  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6">
      <PageHeader titulo="Autorizaciones" subtitulo="Revisa y autoriza los lotes de reembolsos pendientes" />
      {msg && <p className="mb-3 rounded-lg bg-slate-100 px-3 py-1.5 text-sm text-slate-700">{msg}</p>}

      <div className="mb-4 sm:max-w-sm">
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por lote, sucursal o beneficiario…"
          className="w-full rounded-lg border border-slate-300 bg-white py-2 px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
        />
      </div>

      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-blue-700">
        Pendientes de autorizar ({lotes.length})
      </h2>

      {visibles.length === 0 ? (
        <Card className="p-4 text-center text-sm text-slate-400 sm:p-6">
          {busqueda ? "Ningún lote coincide con la búsqueda." : "No hay lotes pendientes de autorizar."}
        </Card>
      ) : (
        <div className="space-y-3">
          {visibles.map((g) => (
            <LoteCard
              key={g.lote}
              lote={g.lote}
              sucursal={g.sucursal}
              numReembolsos={g.reembolsos.length}
              total={g.total}
              acentoColor="border-l-blue-500"
              chipTono="cyan"
              accion={
                <div className="flex flex-wrap gap-2">
                  <button className={BTN_OK} disabled={autorizar.isPending} onClick={() => onAutorizar(g)}>
                    Autorizar
                  </button>
                  <button className={BTN_NO} disabled={rechazar.isPending}
                          onClick={() => setMotivoAbierto((p) => ({ ...p, [g.lote]: !p[g.lote] }))}>
                    Rechazar
                  </button>
                </div>
              }
              detalle={
                <div className="space-y-3">
                  <TablaDetalle reembolsos={g.reembolsos} />
                  {motivoAbierto[g.lote] && (
                    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-white p-2.5">
                      <input
                        type="text"
                        value={motivoPorLote[g.lote] ?? ""}
                        onChange={(e) => setMotivoPorLote((p) => ({ ...p, [g.lote]: e.target.value }))}
                        placeholder="Motivo del rechazo (opcional)"
                        className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                      />
                      <button className={BTN_NO} disabled={rechazar.isPending} onClick={() => onRechazar(g)}>
                        Confirmar rechazo
                      </button>
                    </div>
                  )}
                </div>
              }
            />
          ))}
        </div>
      )}
    </main>
  );
}
