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
  const pageSize = 20;
  const pendientesQ = useReembolsos({ estado: "pendiente", page, pageSize });
  const enCorteQ = useReembolsos({ estado: "en_corte", page: 0, pageSize: 1 });
  const { mutate, isPending, data: resultado } = useEnviarACorte();
  const queryClient = useQueryClient();
  const [msg, setMsg] = useState("");

  const pendientes = useMemo(() => (pendientesQ.data?.rows ?? []) as Fila[], [pendientesQ.data]);
  const totalPendientes = pendientesQ.data?.total ?? 0;
  const totalEnCorte = enCorteQ.data?.total ?? 0;

  const totalMonto = useMemo(() => pendientes.reduce((s, r) => s + Number(r.monto ?? 0), 0), [pendientes]);
  const totalComprobantes = useMemo(
    () => pendientes.reduce((s, r) => s + (Array.isArray(r.archivos) ? r.archivos.length : 0), 0),
    [pendientes],
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
      archivos: (r.archivos as unknown[]) ?? [],
    }));
    setMsg("");
    mutate(
      { reembolsosPendientes: lista, numeroLote: lote, emailRemitente: sesion.email, nombreRemitente: sesion.nombre, sucursalUsuario: sesion.sucursal },
      {
        onSuccess: (res) => {
          setMsg(res.ok ? `✅ Correo enviado. Lote ${res.numeroLoteCompleto} · ${res.actualizados} en corte.` : `⚠ ${res.error}`);
          if (res.ok) queryClient.invalidateQueries({ queryKey: ["reembolsos"] });
        },
      },
    );
  }

  return (
    <main className="mx-auto max-w-6xl p-6">
      <PageHeader titulo="Revisión" subtitulo="Arma el lote de pendientes y envíalo a corte por correo" />
      {msg && (
        <p className={`mb-4 rounded-lg px-3 py-2 text-sm ${resultado?.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{msg}</p>
      )}

      <Card className="mb-3 border-l-4 border-l-amber-400 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-4">
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            <Metrica etiqueta="Total" valor={<Money monto={parseMonto(totalMonto)} />} />
            <Metrica etiqueta="Solicitudes" valor={totalPendientes} />
            <Metrica etiqueta="Comprobantes" valor={`${totalComprobantes} img`} />
            <Metrica etiqueta="Se enviará" valor="1 correo" />
          </div>
          <button
            onClick={onEnviarACorte}
            disabled={isPending || pendientes.length === 0}
            className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-800 disabled:opacity-40"
          >
            {isPending ? "Enviando…" : "Enviar a corte (correo a Fernando)"}
          </button>
        </div>
        <DataTable
          rows={pendientes}
          columnas={columnas}
          total={totalPendientes}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          loading={pendientesQ.isLoading}
        />
      </Card>

      <Card className="border-l-4 border-l-blue-400 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-800">En proceso · esperando respuesta ({totalEnCorte})</h2>
            <p className="mt-0.5 text-sm text-slate-600">Estos lotes ya se enviaron a Fernando. Él responde AUTORIZO/RECHAZO por correo.</p>
          </div>
          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: ["reembolsos"] })}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            Verificar respuestas
          </button>
        </div>
      </Card>
    </main>
  );
}
