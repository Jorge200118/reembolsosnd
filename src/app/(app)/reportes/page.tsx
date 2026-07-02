"use client";
import { useState } from "react";
import { useReembolsos } from "@/lib/hooks/useReembolsos";
import { DataTable, type Columna } from "@/components/ui/DataTable";
import { Money } from "@/components/ui/Money";
import { EstadoBadge } from "@/components/ui/EstadoBadge";
import {
  ESTADOS,
  SUCURSALES,
  parseMonto,
  type Estado,
} from "@devoluciones/domain";

type Fila = Record<string, unknown>;

const columnas: Columna<Fila>[] = [
  { header: "Beneficiario", cell: (r) => String(r.nombre_beneficiario ?? "") },
  { header: "Concepto", cell: (r) => String(r.concepto ?? "") },
  { header: "Sucursal", cell: (r) => String(r.sucursal_usuario ?? "") },
  { header: "Monto", cell: (r) => <Money monto={parseMonto(r.monto as number)} /> },
  { header: "Estado", cell: (r) => <EstadoBadge estado={r.estado as Estado} /> },
];

export default function ReportesPage() {
  const [estado, setEstado] = useState<Estado | "">("");
  const [sucursal, setSucursal] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 25;

  const { data, isLoading } = useReembolsos({
    estado: estado || undefined,
    sucursal: sucursal || undefined,
    page,
    pageSize,
  });

  return (
    <main className="p-6">
      <h1 className="mb-4 text-2xl font-bold text-slate-800">Reportes</h1>
      <div className="mb-4 flex gap-3">
        <select
          className="rounded border px-3 py-2"
          value={estado}
          onChange={(e) => { setEstado(e.target.value as Estado | ""); setPage(0); }}
        >
          <option value="">Todos los estados</option>
          {ESTADOS.map((e) => (
            <option key={e} value={e}>{e}</option>
          ))}
        </select>
        <select
          className="rounded border px-3 py-2"
          value={sucursal}
          onChange={(e) => { setSucursal(e.target.value); setPage(0); }}
        >
          <option value="">Todas las sucursales</option>
          {SUCURSALES.map((s) => (
            <option key={s.codigo} value={s.codigo}>{s.nombre}</option>
          ))}
        </select>
      </div>
      <DataTable
        rows={data?.rows ?? []}
        columnas={columnas}
        total={data?.total ?? 0}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        loading={isLoading}
      />
    </main>
  );
}
