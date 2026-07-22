"use client";
import { useState } from "react";
import { soloDigitos, LARGO_CODIGO } from "@/lib/materiales/codigo";

// El código va DESPUÉS del resumen de cantidades a propósito: pedido antes,
// solo probaría que el empleado se paró ahí; pedido después de enseñarle lo
// que se lleva, es su conformidad con esas cantidades.

export function CapturaEntrega({
  codigo,
  onCodigo,
  onFoto,
  nombreQuienRecoge,
}: {
  codigo: string;
  onCodigo: (c: string) => void;
  onFoto: (f: File | null) => void;
  nombreQuienRecoge?: string;
}) {
  const [nombreArchivo, setNombreArchivo] = useState("");

  return (
    <div className="mt-4 space-y-3 border-t border-slate-200 pt-3">
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">
          Foto de la entrega
        </label>
        <input
          type="file"
          accept="image/*"
          aria-label="Foto de la entrega"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            onFoto(f);
            setNombreArchivo(f?.name ?? "");
          }}
          className="block w-full text-sm text-slate-600"
        />
        <p className="mt-1 text-xs text-slate-500">
          Lo más útil es el material sobre el mostrador, antes de entregarlo.
        </p>
        {!nombreArchivo && <p className="mt-1 text-xs text-amber-700">Falta la foto</p>}
      </div>

      <div>
        <label htmlFor="codigo-entrega" className="mb-1 block text-sm font-medium text-slate-700">
          Pídele su código {nombreQuienRecoge ? `a ${nombreQuienRecoge}` : "al empleado"}
        </label>
        <input
          id="codigo-entrega"
          // inputMode numérico pero type text: el código es una cadena y puede
          // empezar en cero, y type="number" se los come.
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="6 dígitos"
          value={codigo}
          onChange={(e) => onCodigo(soloDigitos(e.target.value))}
          className="w-40 rounded-lg border border-slate-300 px-3 py-2 text-center text-xl font-bold tracking-[0.4em] text-slate-900"
        />
        <p className="mt-1 text-xs text-slate-500">
          Lo trae en su app, en la solicitud autorizada. Van {codigo.length} de {LARGO_CODIGO}.
        </p>
      </div>
    </div>
  );
}
