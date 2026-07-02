"use client";
import { useState } from "react";
import { useReembolsos } from "@/lib/hooks/useReembolsos";
import { DataTable, type Columna } from "@/components/ui/DataTable";
import { Money } from "@/components/ui/Money";
import { EstadoBadge } from "@/components/ui/EstadoBadge";
import { parseMonto, type Estado } from "@devoluciones/domain";

type Fila = Record<string, unknown>;

const columnas: Columna<Fila>[] = [
  { header: "Beneficiario", cell: (r) => String(r.nombre_beneficiario ?? "") },
  { header: "Concepto", cell: (r) => String(r.concepto ?? "") },
  { header: "Monto", cell: (r) => <Money monto={parseMonto(r.monto as number)} /> },
  { header: "Estado", cell: (r) => <EstadoBadge estado={r.estado as Estado} /> },
];

export default function RevisionPage() {
  const [page, setPage] = useState(0);
  const pageSize = 20;
  const { data, isLoading } = useReembolsos({ estado: "pendiente", page, pageSize });

  return (
    <main className="p-6">
      <h1 className="mb-4 text-2xl font-bold text-slate-800">Revisión</h1>
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
