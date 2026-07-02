"use client";
import { useState } from "react";

const TIPOS_PERMITIDOS = [
  "image/jpeg", "image/jpg", "image/png", "application/pdf",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];
const TAMANO_MAXIMO = 10 * 1024 * 1024; // 10MB

export function validarArchivos(files: File[]): string | null {
  if (files.length === 0) return "Debes adjuntar al menos un comprobante";
  for (const f of files) {
    if (!TIPOS_PERMITIDOS.includes(f.type)) return `Tipo no permitido: ${f.name}`;
    if (f.size > TAMANO_MAXIMO) return `Archivo muy grande (máx 10MB): ${f.name}`;
  }
  return null;
}

export function SelectorArchivos({ onChange }: { onChange: (files: File[]) => void }) {
  const [nombres, setNombres] = useState<string[]>([]);
  const [error, setError] = useState("");

  function handle(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    const err = validarArchivos(files);
    if (err) { setError(err); setNombres([]); onChange([]); return; }
    setError("");
    setNombres(files.map((f) => f.name));
    onChange(files);
  }

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">Comprobantes * (obligatorio)</label>
      <input
        type="file" multiple
        accept="image/jpeg,image/png,application/pdf,.xls,.xlsx"
        onChange={handle}
        className="w-full rounded-lg border px-3 py-2 text-sm"
      />
      {nombres.length > 0 && (
        <ul className="mt-2 text-xs text-slate-700">
          {nombres.map((n) => <li key={n}>📎 {n}</li>)}
        </ul>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
