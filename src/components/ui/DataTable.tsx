"use client";

import type { ReactNode } from "react";

export interface Columna<T> {
  header: string;
  cell: (row: T) => ReactNode;
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
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b-2 border-slate-200 text-left">
            {columnas.map((c, i) => (
              <th key={i} className="p-3 text-sm font-semibold text-slate-600">
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={columnas.length} className="p-8 text-center text-slate-400">
                Cargando…
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={columnas.length} className="p-8 text-center text-slate-400">
                Sin resultados
              </td>
            </tr>
          ) : (
            rows.map((row, ri) => (
              <tr key={ri} className="border-b border-slate-100">
                {columnas.map((c, ci) => (
                  <td key={ci} className="p-3">
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
      <div className="flex items-center justify-between p-3 text-sm">
        <span className="text-slate-500">
          {total} registros · página {page + 1} de {totalPages}
        </span>
        <div className="flex gap-2">
          <button
            className="rounded border px-3 py-1 disabled:opacity-40"
            disabled={page === 0}
            onClick={() => onPageChange(page - 1)}
          >
            Anterior
          </button>
          <button
            className="rounded border px-3 py-1 disabled:opacity-40"
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
