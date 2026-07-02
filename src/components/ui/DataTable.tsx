"use client";

import type { ReactNode } from "react";

export interface Columna<T> {
  header: string;
  cell: (row: T) => ReactNode;
  align?: "left" | "right" | "center";
}

export interface DataTableProps<T> {
  rows: T[];
  columnas: Columna<T>[];
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  loading?: boolean;
}

const alineacion = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
} as const;

export function DataTable<T>({
  rows,
  columnas,
  total,
  page,
  pageSize,
  onPageChange,
  loading,
}: DataTableProps<T>) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              {columnas.map((c, i) => (
                <th
                  key={i}
                  className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500 ${alineacion[c.align ?? "left"]}`}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columnas.length} className="px-4 py-12 text-center text-slate-500">
                  <span className="inline-flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
                    Cargando…
                  </span>
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={columnas.length} className="px-4 py-12 text-center text-slate-400">
                  Sin resultados
                </td>
              </tr>
            ) : (
              rows.map((row, ri) => (
                <tr key={ri} className="border-b border-slate-100 transition-colors last:border-0 hover:bg-blue-50/40">
                  {columnas.map((c, ci) => (
                    <td key={ci} className={`px-4 py-2.5 text-slate-900 ${alineacion[c.align ?? "left"]}`}>
                      {c.cell(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/60 px-4 py-3 text-sm">
        <span className="text-slate-600">
          <span className="font-semibold text-slate-900">{total.toLocaleString("es-MX")}</span> registros · página {page + 1} de {totalPages}
        </span>
        <div className="flex gap-2">
          <button
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white"
            disabled={page === 0}
            onClick={() => onPageChange(page - 1)}
          >
            Anterior
          </button>
          <button
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white"
            disabled={page + 1 >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            Siguiente
          </button>
        </div>
      </div>
    </div>
  );
}
