"use client";
import { useMemo, useState } from "react";
import { useReembolsos } from "@/lib/hooks/useReembolsos";
import { agruparPorLote, type Fila } from "@/lib/reportes/agruparPorLote";
import { exportarExcel } from "@/lib/reportes/exportarExcel";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { LoteCard } from "@/components/ui/LoteCard";
import { DataTable, type Columna } from "@/components/ui/DataTable";
import { Money } from "@/components/ui/Money";
import { EstadoBadge } from "@/components/ui/EstadoBadge";
import { Chip } from "@/components/ui/Chip";
import { ESTADOS, SUCURSALES, parseMonto, type Estado } from "@devoluciones/domain";

const INPUT = "w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-200";
const LABEL = "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500";
const BTN_VERDE = "rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-40";
const BTN_TAB = (activo: boolean) =>
  `rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${activo ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`;

const columnas: Columna<Fila>[] = [
  { header: "Beneficiario", cell: (r) => <span className="text-slate-900">{String(r.nombre_beneficiario ?? "")}</span> },
  { header: "Fecha", cell: (r) => <span className="text-slate-600">{r.fecha ? new Date(String(r.fecha) + "T12:00:00").toLocaleDateString("es-MX") : "—"}</span> },
  { header: "Concepto", cell: (r) => <span className="text-slate-900">{String(r.concepto ?? "")}</span> },
  { header: "Sucursal", cell: (r) => <Chip tono="morado">{String(r.sucursal_usuario ?? "—")}</Chip> },
  { header: "Lote", cell: (r) => <span className="text-slate-600">{String(r.numero_lote ?? "—")}</span> },
  { header: "Archivos", cell: (r) => <span className="text-slate-600">{Array.isArray(r.archivos) ? `📎 ${r.archivos.length}` : "—"}</span> },
  { header: "Monto", align: "right", cell: (r) => <Money monto={parseMonto(r.monto as number)} /> },
  { header: "Estado", align: "center", cell: (r) => <EstadoBadge estado={r.estado as Estado} /> },
];

export default function ReportesPage() {
  const [estado, setEstado] = useState<Estado | "">("");
  const [sucursal, setSucursal] = useState("");
  const [beneficiario, setBeneficiario] = useState("");
  const [lote, setLote] = useState("");
  const [vista, setVista] = useState<"tabla" | "lotes">("tabla");
  const [page, setPage] = useState(0);
  const pageSize = 25;

  const { data, isLoading } = useReembolsos({
    estado: estado || undefined,
    sucursal: sucursal || undefined,
    page,
    pageSize,
  });

  const filas = useMemo(() => {
    let rows = (data?.rows ?? []) as Fila[];
    if (beneficiario.trim()) {
      const q = beneficiario.trim().toLowerCase();
      rows = rows.filter((r) => String(r.nombre_beneficiario ?? "").toLowerCase().includes(q));
    }
    if (lote.trim()) {
      const q = lote.trim().toLowerCase();
      rows = rows.filter((r) => String(r.numero_lote ?? "").toLowerCase().includes(q));
    }
    return rows;
  }, [data, beneficiario, lote]);

  const totalMonto = useMemo(() => filas.reduce((s, r) => s + Number(r.monto ?? 0), 0), [filas]);
  const lotes = useMemo(() => agruparPorLote(filas, "numero_lote"), [filas]);

  return (
    <main className="mx-auto max-w-6xl p-6">
      <PageHeader titulo="Reportes" subtitulo="Consulta, filtra y exporta los reembolsos" />

      <Card className="mb-3 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className={LABEL}>Estado</label>
            <select className={INPUT} value={estado} onChange={(e) => { setEstado(e.target.value as Estado | ""); setPage(0); }}>
              <option value="">Todos los estados</option>
              {ESTADOS.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
          <div>
            <label className={LABEL}>Sucursal</label>
            <select className={INPUT} value={sucursal} onChange={(e) => { setSucursal(e.target.value); setPage(0); }}>
              <option value="">Todas las sucursales</option>
              {SUCURSALES.map((s) => <option key={s.codigo} value={s.codigo}>{s.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className={LABEL}>Beneficiario</label>
            <input className={INPUT} placeholder="Nombre…" value={beneficiario} onChange={(e) => setBeneficiario(e.target.value)} />
          </div>
          <div>
            <label className={LABEL}>Lote</label>
            <input className={INPUT} placeholder="Ej: 41-JOSE" value={lote} onChange={(e) => setLote(e.target.value)} />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button className={BTN_VERDE} disabled={filas.length === 0} onClick={() => exportarExcel(filas)}>
            Exportar Excel
          </button>
          <div className="ml-auto flex gap-2">
            <button className={BTN_TAB(vista === "tabla")} onClick={() => setVista("tabla")}>Vista tabla</button>
            <button className={BTN_TAB(vista === "lotes")} onClick={() => setVista("lotes")}>Vista por lotes</button>
          </div>
        </div>
      </Card>

      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-sm text-slate-600">
          <span className="font-semibold tabular-nums text-slate-900">{(data?.total ?? 0).toLocaleString("es-MX")}</span> registros
        </span>
        <span className="text-sm text-slate-600">
          Total página: <span className="font-semibold tabular-nums text-slate-900"><Money monto={parseMonto(totalMonto)} /></span>
        </span>
      </div>

      {vista === "tabla" ? (
        <DataTable
          rows={filas}
          columnas={columnas}
          total={data?.total ?? 0}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          loading={isLoading}
        />
      ) : (
        <div className="space-y-3">
          {lotes.length === 0 ? (
            <Card className="p-8 text-center text-sm text-slate-400">Sin resultados.</Card>
          ) : (
            lotes.map((g) => (
              <LoteCard
                key={g.lote}
                lote={g.lote}
                sucursal={g.sucursal}
                numReembolsos={g.reembolsos.length}
                total={g.total}
                acentoColor="border-l-blue-500"
                chipTono="cyan"
                detalle={
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                          <th className="pb-2 pr-4">Beneficiario</th>
                          <th className="pb-2 pr-4">Concepto</th>
                          <th className="pb-2 text-right">Monto</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.reembolsos.map((r) => (
                          <tr key={String(r.id)} className="border-t border-slate-200">
                            <td className="py-1.5 pr-4 text-slate-900">{String(r.nombre_beneficiario ?? "")}</td>
                            <td className="py-1.5 pr-4 text-slate-600">{String(r.concepto ?? "")}</td>
                            <td className="py-1.5 text-right"><Money monto={parseMonto(r.monto as number)} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                }
              />
            ))
          )}
        </div>
      )}
    </main>
  );
}
