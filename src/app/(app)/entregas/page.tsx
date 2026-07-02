"use client";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useReembolsos } from "@/lib/hooks/useReembolsos";
import { useSolicitarEntrega, useMarcarEntregado } from "@/lib/hooks/useEntregas";
import { agruparPorLote, type Fila } from "@/lib/reportes/agruparPorLote";
import { imprimirComprobanteLote } from "@/lib/entregas/comprobanteImprimible";
import { useAuth } from "@/lib/auth/AuthContext";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { LoteCard } from "@/components/ui/LoteCard";
import { Money } from "@/components/ui/Money";
import { parseMonto } from "@devoluciones/domain";
import type { AprobadoLite } from "@/lib/supabase/queries/entregas";

const BTN_CYAN = "rounded-lg bg-cyan-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-cyan-700 disabled:opacity-40";

function TablaDetalle({ reembolsos, conConcepto = true }: { reembolsos: Fila[]; conConcepto?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="pb-1.5 pr-4">Beneficiario</th>
            {conConcepto && <th className="pb-1.5 pr-4">Concepto</th>}
            <th className="pb-1.5 pr-4 text-right">Monto</th>
            <th className="pb-1.5">Fecha</th>
          </tr>
        </thead>
        <tbody>
          {reembolsos.map((r) => (
            <tr key={String(r.id)} className="border-t border-slate-200">
              <td className="py-1.5 pr-4 text-slate-900">{String(r.nombre_beneficiario ?? "")}</td>
              {conConcepto && <td className="py-1.5 pr-4 text-slate-600">{String(r.concepto ?? "")}</td>}
              <td className="py-1.5 pr-4 text-right"><Money monto={parseMonto(r.monto as number)} /></td>
              <td className="py-1.5 text-slate-600">{r.fecha ? new Date(String(r.fecha) + "T12:00:00").toLocaleDateString("es-MX") : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function EntregasPage() {
  const { sesion } = useAuth();
  const aprobadosQ = useReembolsos({ estado: "aprobado", page: 0, pageSize: 500 });
  const solicitadosQ = useReembolsos({ estado: "solicitado_entrega", page: 0, pageSize: 500 });
  const solicitar = useSolicitarEntrega();
  const entregar = useMarcarEntregado();
  const queryClient = useQueryClient();
  const [msg, setMsg] = useState("");
  const [evidenciaPorLote, setEvidenciaPorLote] = useState<Record<string, File | null>>({});

  const aprobados = useMemo(() => (aprobadosQ.data?.rows ?? []) as Fila[], [aprobadosQ.data]);
  const solicitados = useMemo(() => (solicitadosQ.data?.rows ?? []) as Fila[], [solicitadosQ.data]);

  const lotesAprobados = useMemo(() => agruparPorLote(aprobados, "numero_lote"), [aprobados]);
  const lotesSolicitados = useMemo(() => agruparPorLote(solicitados, "numero_lote"), [solicitados]);

  function refrescar() {
    queryClient.invalidateQueries({ queryKey: ["reembolsos"] });
  }

  function onSolicitarLote(reembolsos: Fila[]) {
    const lista: AprobadoLite[] = reembolsos.map((r) => ({
      id: String(r.id),
      nombre_beneficiario: String(r.nombre_beneficiario ?? ""),
      monto: Number(r.monto),
      sucursal_usuario: r.sucursal_usuario ? String(r.sucursal_usuario) : null,
    }));
    setMsg("");
    solicitar.mutate(lista, {
      onSuccess: (res) => {
        if (res.ok) {
          imprimirComprobanteLote({
            numeroSolicitud: res.numeroSolicitud ?? "",
            sucursal: lista[0]?.sucursal_usuario ?? "N/A",
            solicitante: sesion?.nombre ?? "",
            reembolsos,
          });
          setMsg(`✅ Solicitud ${res.numeroSolicitud} generada · ${res.actualizados} en entrega`);
          refrescar();
        } else {
          setMsg(`⚠ ${res.error}`);
        }
      },
    });
  }

  function onEntregarLote(lote: string, reembolsos: Fila[]) {
    const ev = evidenciaPorLote[lote];
    if (!ev) { setMsg("⚠ Adjunta la foto de evidencia del lote"); return; }
    const ids = reembolsos.map((r) => String(r.id));
    setMsg("");
    entregar.mutate({ ids, evidencia: ev }, {
      onSuccess: (res) => {
        setMsg(res.ok ? `✅ ${res.actualizados} entregado(s) en el lote ${lote}` : `⚠ ${res.error}`);
        if (res.ok) { setEvidenciaPorLote((p) => ({ ...p, [lote]: null })); refrescar(); }
      },
    });
  }

  return (
    <main className="mx-auto max-w-6xl p-6">
      <PageHeader titulo="Entregas" subtitulo="Solicita la entrega de lotes aprobados y confirma la entrega con evidencia" />
      {msg && <p className="mb-3 rounded-lg bg-slate-100 px-3 py-1.5 text-sm text-slate-700">{msg}</p>}

      <section className="mb-6">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">
          Aprobados · listos para solicitar entrega ({aprobados.length})
        </h2>
        {lotesAprobados.length === 0 ? (
          <Card className="p-6 text-center text-sm text-slate-400">No hay lotes aprobados pendientes.</Card>
        ) : (
          <div className="space-y-3">
            {lotesAprobados.map((g) => (
              <LoteCard
                key={g.lote}
                lote={g.lote}
                sucursal={g.sucursal}
                numReembolsos={g.reembolsos.length}
                total={g.total}
                acentoColor="border-l-emerald-500"
                chipTono="verde"
                accion={
                  <button className={BTN_CYAN} disabled={solicitar.isPending} onClick={() => onSolicitarLote(g.reembolsos)}>
                    Solicitar entrega
                  </button>
                }
                detalle={<TablaDetalle reembolsos={g.reembolsos} />}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-700">
          Esperando entrega ({solicitados.length})
        </h2>
        {lotesSolicitados.length === 0 ? (
          <Card className="p-6 text-center text-sm text-slate-400">No hay lotes esperando entrega.</Card>
        ) : (
          <div className="space-y-3">
            {lotesSolicitados.map((g) => (
              <LoteCard
                key={g.lote}
                lote={g.lote}
                numeroSolicitud={g.numeroSolicitud}
                numReembolsos={g.reembolsos.length}
                total={g.total}
                acentoColor="border-l-amber-500"
                chipTono="ambar"
                detalle={
                  <div className="space-y-3">
                    <TablaDetalle reembolsos={g.reembolsos} />
                    <div className="flex flex-wrap items-center gap-3 rounded-lg bg-white p-2.5">
                      <label className="text-sm font-medium text-slate-700">Evidencia del lote:</label>
                      <input
                        type="file" accept="image/*"
                        onChange={(e) => setEvidenciaPorLote((p) => ({ ...p, [g.lote]: e.target.files?.[0] ?? null }))}
                        className="text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700"
                      />
                      <button
                        className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-slate-900 disabled:opacity-40"
                        disabled={entregar.isPending || !evidenciaPorLote[g.lote]}
                        onClick={() => onEntregarLote(g.lote, g.reembolsos)}
                      >
                        Marcar lote como entregado
                      </button>
                    </div>
                  </div>
                }
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
