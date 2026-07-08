"use client";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useReembolsos } from "@/lib/hooks/useReembolsos";
import { useEnviarACorte } from "@/lib/hooks/useEnviarACorte";
import { useAuth } from "@/lib/auth/AuthContext";
import { type Fila } from "@/lib/reportes/agruparPorLote";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { DataTable, type Columna } from "@/components/ui/DataTable";
import { Money } from "@/components/ui/Money";
import { EstadoBadge } from "@/components/ui/EstadoBadge";
import { parseMonto, type Estado } from "@devoluciones/domain";
import type { ReembolsoLite } from "@/lib/supabase/queries/corte";

const columnas: Columna<Fila>[] = [
  { header: "Beneficiario", cell: (r) => <span className="text-slate-900">{String(r.nombre_beneficiario ?? "")}</span> },
  { header: "Concepto", cell: (r) => <span className="text-slate-900">{String(r.concepto ?? "")}</span> },
  { header: "Monto", align: "right", cell: (r) => <Money monto={parseMonto(r.monto as number)} /> },
  { header: "Estado", align: "center", cell: (r) => <EstadoBadge estado={r.estado as Estado} /> },
];

function Metrica({ etiqueta, valor }: { etiqueta: string; valor: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{etiqueta}</div>
      <div className="mt-0.5 text-lg font-bold text-slate-900">{valor}</div>
    </div>
  );
}

export default function RevisionPage() {
  const { sesion } = useAuth();
  const [page, setPage] = useState(0);
  const [busqueda, setBusqueda] = useState("");
  const pageSize = 20;
  const pendientesQ = useReembolsos({ estado: "pendiente", page: 0, pageSize: 500 });
  const enCorteQ = useReembolsos({ estado: "en_corte", page: 0, pageSize: 1 });
  const { mutate, isPending, data: resultado } = useEnviarACorte();
  const queryClient = useQueryClient();
  const [msg, setMsg] = useState("");

  const pendientes = useMemo(() => (pendientesQ.data?.rows ?? []) as Fila[], [pendientesQ.data]);
  const totalEnCorte = enCorteQ.data?.total ?? 0;

  const totalMonto = useMemo(() => pendientes.reduce((s, r) => s + Number(r.monto ?? 0), 0), [pendientes]);
  const totalComprobantes = useMemo(
    () => pendientes.reduce((s, r) => s + (Array.isArray(r.archivos) ? r.archivos.length : 0), 0),
    [pendientes],
  );

  // Filtrado en cliente por beneficiario o concepto sobre todos los pendientes.
  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return pendientes;
    return pendientes.filter((r) => {
      const beneficiario = String(r.nombre_beneficiario ?? "").toLowerCase();
      const concepto = String(r.concepto ?? "").toLowerCase();
      return beneficiario.includes(q) || concepto.includes(q);
    });
  }, [pendientes, busqueda]);

  const totalPendientes = filtrados.length;
  const paginaActual = useMemo(
    () => filtrados.slice(page * pageSize, page * pageSize + pageSize),
    [filtrados, page, pageSize],
  );

  function onEnviarACorte() {
    if (!sesion) return;
    const lote = window.prompt("Número de lote para este corte (solo números):");
    if (lote === null) return;
    const lista: ReembolsoLite[] = pendientes.map((r) => ({
      id: String(r.id),
      nombre_beneficiario: String(r.nombre_beneficiario ?? ""),
      concepto: String(r.concepto ?? ""),
      fecha: String(r.fecha ?? ""),
      monto: Number(r.monto),
    }));
    setMsg("");
    mutate(
      { reembolsosPendientes: lista, numeroLote: lote, nombreRemitente: sesion.nombre },
      {
        onSuccess: (res) => {
          setMsg(res.ok ? `✅ Lote ${res.numeroLoteCompleto} enviado a corte · ${res.actualizados} en corte.` : `⚠ ${res.error}`);
          if (res.ok) queryClient.invalidateQueries({ queryKey: ["reembolsos"] });
        },
      },
    );
  }

  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6">
      <PageHeader titulo="Revisión" subtitulo="Arma el lote de pendientes y envíalo a corte" />
      {msg && (
        <p className={`mb-4 rounded-lg px-3 py-2 text-sm ${resultado?.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{msg}</p>
      )}

      <Card className="mb-3 border-l-4 border-l-amber-400 p-4">
        <div className="mb-3 flex flex-col items-stretch justify-between gap-4 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            <Metrica etiqueta="Total" valor={<Money monto={parseMonto(totalMonto)} />} />
            <Metrica etiqueta="Solicitudes" valor={pendientes.length} />
            <Metrica etiqueta="Comprobantes" valor={`${totalComprobantes} img`} />
            <Metrica etiqueta="Lotes" valor="1 corte" />
          </div>
          <button
            onClick={onEnviarACorte}
            disabled={isPending || pendientes.length === 0}
            className="w-full rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-800 disabled:opacity-40 sm:w-auto"
          >
            {isPending ? "Enviando…" : "Enviar a corte"}
          </button>
        </div>
        <div className="mb-3 flex items-center gap-2">
          <div className="relative flex-1 sm:max-w-xs">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            </span>
            <input
              type="search"
              value={busqueda}
              onChange={(e) => { setBusqueda(e.target.value); setPage(0); }}
              placeholder="Buscar por beneficiario o concepto…"
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>
          {busqueda && (
            <span className="text-xs text-slate-500">{totalPendientes} resultado(s)</span>
          )}
        </div>
        <DataTable
          rows={paginaActual}
          columnas={columnas}
          total={totalPendientes}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          loading={pendientesQ.isLoading}
        />
      </Card>

      <Card className="border-l-4 border-l-blue-400 p-4">
        <div className="flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center sm:gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-800">En proceso · esperando respuesta ({totalEnCorte})</h2>
            <p className="mt-0.5 text-sm text-slate-600">Estos lotes están en corte, pendientes de autorización por el Lic Fernando en su módulo.</p>
          </div>
          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: ["reembolsos"] })}
            className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 sm:w-auto sm:shrink-0"
          >
            Verificar respuestas
          </button>
        </div>
      </Card>
    </main>
  );
}
