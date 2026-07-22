"use client";
import { useRef, useState, useEffect } from "react";
import { soloDigitos, LARGO_CODIGO } from "@/lib/materiales/codigo";

// Dos pasos numerados a propósito: la foto va primero y el código DESPUÉS, para
// que el código sea la conformidad del empleado con lo que ya vio, no un simple
// "aquí estuve". `capture="environment"` abre la cámara trasera directo en
// celular/tablet: se fuerza tomar la foto en el momento, no subir una vieja.

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
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string>("");

  // Libera la URL del objeto al desmontar (o al cambiar de foto): si no, cada
  // foto tomada deja un blob colgado en memoria.
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function alTomarFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    onFoto(f);
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return f ? URL.createObjectURL(f) : "";
    });
  }

  const abrirCamara = () => inputRef.current?.click();

  return (
    <div className="mt-4 space-y-4 border-t border-slate-200 pt-4">
      <div>
        <p className="mb-2 text-sm font-semibold text-slate-800">1. Foto de la entrega</p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          aria-label="Foto de la entrega"
          className="hidden"
          onChange={alTomarFoto}
        />
        {preview ? (
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- blob local, next/image no aplica */}
            <img
              src={preview}
              alt="Foto de la entrega"
              className="h-16 w-16 rounded-lg border border-slate-200 object-cover"
            />
            <div className="flex items-center gap-2 text-sm text-emerald-700">
              <span className="font-semibold">✓ Foto lista</span>
              <button type="button" onClick={abrirCamara} className="text-blue-700 underline">
                Repetir
              </button>
            </div>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={abrirCamara}
              className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:border-blue-400 hover:bg-blue-50"
            >
              <span aria-hidden>📷</span> Tomar foto
            </button>
            <p className="mt-1 text-xs text-amber-700">Falta la foto</p>
          </>
        )}
      </div>

      <div>
        <label htmlFor="codigo-entrega" className="mb-2 block text-sm font-semibold text-slate-800">
          2. Pídele su código {nombreQuienRecoge ? `a ${nombreQuienRecoge}` : "al empleado"}
        </label>
        <input
          id="codigo-entrega"
          // type text con inputMode numérico: el código es una cadena y puede
          // empezar en cero (004729); type="number" se come los ceros de adelante.
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="6 dígitos"
          value={codigo}
          onChange={(e) => onCodigo(soloDigitos(e.target.value))}
          className="w-44 rounded-lg border border-slate-300 px-3 py-2 text-center text-xl font-bold tracking-[0.4em] text-slate-900"
        />
        <p className="mt-1 text-xs text-slate-500">
          Lo trae en su app, en la solicitud autorizada. Van {codigo.length} de {LARGO_CODIGO}.
        </p>
      </div>
    </div>
  );
}
