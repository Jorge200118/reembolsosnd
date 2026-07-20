"use client";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useReembolsos } from "@/lib/hooks/useReembolsos";
import { useSolicitarEntrega, useMarcarEntregado } from "@/lib/hooks/useEntregas";
import { agruparPorLote, type Fila, type GrupoLote } from "@/lib/reportes/agruparPorLote";
import { imprimirComprobanteLote } from "@/lib/entregas/comprobanteImprimible";
import { useAuth } from "@/lib/auth/AuthContext";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { LoteCard } from "@/components/ui/LoteCard";
import { Money } from "@/components/ui/Money";
import { ComprobantesModal } from "@/components/ui/ComprobantesModal";
import { parseMonto } from "@devoluciones/domain";
import type { AprobadoLite } from "@/lib/supabase/queries/entregas";

const BTN_CYAN = "rounded-lg bg-cyan-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-cyan-700 disabled:opacity-40";

function TablaDetalle({
  reembolsos,
  conConcepto = true,
  onVerComprobantes,
}: {
  reembolsos: Fila[];
  conConcepto?: boolean;
  onVerComprobantes: (reembolsos: Fila[], indice: number) => void;
}) {
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
          {reembolsos.map((r, i) => (
            <tr
              key={String(r.id)}
              onClick={() => onVerComprobantes(reembolsos, i)}
              className="cursor-pointer border-t border-slate-200 transition-colors hover:bg-blue-50/40"
            >
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
  const [busqueda, setBusqueda] = useState("");
  const [evidenciaPorLote, setEvidenciaPorLote] = useState<Record<string, File | null>>({});
  const [comprobantes, setComprobantes] = useState<{ filas: Fila[]; indice: number } | null>(null);

  const aprobados = useMemo(() => (aprobadosQ.data?.rows ?? []) as Fila[], [aprobadosQ.data]);
  const solicitados = useMemo(() => (solicitadosQ.data?.rows ?? []) as Fila[], [solicitadosQ.data]);

  const lotesAprobados = useMemo(() => agruparPorLote(aprobados, "numero_lote"), [aprobados]);
  const lotesSolicitados = useMemo(() => agruparPorLote(solicitados, "numero_lote"), [solicitados]);

  // Filtrado en cliente por número de lote, sucursal o número de solicitud.
  const filtrar = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return (grupos: GrupoLote[]) => {
      if (!q) return grupos;
      return grupos.filter((g) => {
        const lote = g.lote.toLowerCase();
        const sucursal = g.sucursal.toLowerCase();
        const solicitud = (g.numeroSolicitud ?? "").toLowerCase();
        return lote.includes(q) || sucursal.includes(q) || solicitud.includes(q);
      });
    };
  }, [busqueda]);

  const aprobadosVisibles = useMemo(() => filtrar(lotesAprobados), [filtrar, lotesAprobados]);
  const solicitadosVisibles = useMemo(() => filtrar(lotesSolicitados), [filtrar, lotesSolicitados]);

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
    <main className="mx-auto max-w-6xl p-4 sm:p-6">
      <PageHeader titulo="Entregas" subtitulo="Solicita la entrega de lotes aprobados y confirma la entrega con evidencia" />
      {msg && <p className="mb-3 rounded-lg bg-slate-100 px-3 py-1.5 text-sm text-slate-700">{msg}</p>}

      <div className="mb-4 flex items-center gap-2">
        <div className="relative flex-1 sm:max-w-sm">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </span>
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por lote, sucursal o solicitud…"
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-100"
          />
        </div>
        {busqueda && (
          <span className="text-xs text-slate-500">
            {aprobadosVisibles.length + solicitadosVisibles.length} lote(s)
          </span>
        )}
      </div>

      <section className="mb-6">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">
          Aprobados · listos para solicitar entrega ({aprobados.length})
        </h2>
        {aprobadosVisibles.length === 0 ? (
          <Card className="p-4 text-center text-sm text-slate-400 sm:p-6">
            {busqueda ? "Ningún lote aprobado coincide con la búsqueda." : "No hay lotes aprobados pendientes."}
          </Card>
        ) : (
          <div className="space-y-3">
            {aprobadosVisibles.map((g) => (
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
                detalle={<TablaDetalle reembolsos={g.reembolsos} onVerComprobantes={(filas, indice) => setComprobantes({ filas, indice })} />}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-700">
          Esperando entrega ({solicitados.length})
        </h2>
        {solicitadosVisibles.length === 0 ? (
          <Card className="p-4 text-center text-sm text-slate-400 sm:p-6">
            {busqueda ? "Ningún lote esperando entrega coincide con la búsqueda." : "No hay lotes esperando entrega."}
          </Card>
        ) : (
          <div className="space-y-3">
            {solicitadosVisibles.map((g) => (
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
                    <TablaDetalle reembolsos={g.reembolsos} onVerComprobantes={(filas, indice) => setComprobantes({ filas, indice })} />
                    <div className="flex flex-wrap items-center gap-3 rounded-lg bg-white p-2.5">
                      <label className="text-sm font-medium text-slate-700">Evidencia del lote:</label>
                      <input
                        type="file" accept="image/*"
                        onChange={(e) => setEvidenciaPorLote((p) => ({ ...p, [g.lote]: e.target.files?.[0] ?? null }))}
                        className="min-w-0 max-w-full text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700"
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

      {comprobantes && (
        <ComprobantesModal
          reembolsos={comprobantes.filas}
          indiceInicial={comprobantes.indice}
          onClose={() => setComprobantes(null)}
        />
      )}
    </main>
  );
}
