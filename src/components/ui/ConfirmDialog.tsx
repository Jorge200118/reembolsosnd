"use client";
import { useState } from "react";
import { useGuardedAction } from "@/lib/hooks/useGuardedAction";

export interface ConfirmDialogProps {
  titulo: string;
  mensaje: React.ReactNode;             // puede incluir <strong> etc.
  textoConfirmar: string;               // ej. "Autorizar"
  colorConfirmar?: "verde" | "rojo";    // default verde -> bg-emerald-600; rojo -> bg-red-600
  conMotivo?: boolean;                  // si true, muestra un textarea de motivo opcional
  isPending?: boolean;                  // deshabilita botones y muestra "Procesando…"
  deshabilitarConfirmar?: boolean;      // además de isPending: falta algo por capturar
  onCancelar: () => void;
  onConfirmar: (motivo?: string) => void; // si conMotivo, pasa el texto (trim); si no, sin arg
}

export function ConfirmDialog({
  titulo,
  mensaje,
  textoConfirmar,
  colorConfirmar = "verde",
  conMotivo = false,
  isPending = false,
  deshabilitarConfirmar = false,
  onCancelar,
  onConfirmar,
}: ConfirmDialogProps) {
  const [motivo, setMotivo] = useState("");

  // Guard síncrono contra doble-tap: evita disparar la mutación dos veces
  // en el instante entre el primer click y que isPending deshabilite el botón.
  const confirmar = useGuardedAction(() =>
    onConfirmar(conMotivo ? motivo.trim() : undefined),
  );

  const btnConfirmar =
    colorConfirmar === "rojo"
      ? "rounded-lg bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-700 disabled:opacity-40"
      : "rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-700 disabled:opacity-40";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onCancelar}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-lg font-bold text-slate-800">{titulo}</h2>
        <div className="text-sm text-slate-700">{mensaje}</div>

        {conMotivo && (
          <div className="mt-4">
            <label className="mb-1 block text-sm font-medium text-slate-700">Motivo (opcional):</label>
            <textarea
              autoFocus
              rows={3}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancelar}
            disabled={isPending}
            className="rounded-lg border px-4 py-2 text-slate-700 disabled:opacity-40"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirmar}
            disabled={isPending || deshabilitarConfirmar}
            className={btnConfirmar}
          >
            {isPending ? "Procesando…" : textoConfirmar}
          </button>
        </div>
      </div>
    </div>
  );
}
