"use client";
import { useState } from "react";
import { useValidarOtp } from "@/lib/hooks/useValidarOtp";
import type { ResultadoOtp } from "@/lib/edge/otpComidas";

const MENSAJES: Record<ResultadoOtp, string> = {
  ok: "✅ Pago liberado correctamente.",
  no_encontrado: "No hay código generado para este chofer esta semana.",
  expirado: "El código ya venció.",
  ya_usado: "Este código ya se usó (el pago ya se liberó).",
  sin_intentos: "Demasiados intentos fallidos. Código bloqueado.",
  codigo_incorrecto: "Código incorrecto. Verifica e intenta de nuevo.",
};

export interface OtpCapturaModalProps {
  empleadoId: number;
  empleadoNombre: string;
  cajeraEmail: string;
  onClose: () => void;
  onExito: () => void;
}

export function OtpCapturaModal({
  empleadoId, empleadoNombre, cajeraEmail, onClose, onExito,
}: OtpCapturaModalProps) {
  const [codigo, setCodigo] = useState("");
  const { mutate, isPending, data, error } = useValidarOtp();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    mutate(
      { empleadoId, codigo: codigo.trim(), cajeraEmail },
      { onSuccess: (r) => { if (r.ok) { onExito(); } } },
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-1 text-lg font-bold text-slate-800">Cobro de comidas</h2>
        <p className="mb-4 text-sm text-slate-700">{empleadoNombre}</p>
        <form onSubmit={onSubmit}>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Código que el chofer recibió por WhatsApp
          </label>
          <input
            autoFocus
            inputMode="numeric"
            maxLength={6}
            className="mb-3 w-full rounded-lg border px-3 py-2 text-center text-2xl tracking-widest tabular-nums text-slate-900"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))}
            placeholder="______"
          />
          {data && (
            <p className={`mb-3 text-sm ${data.ok ? "text-green-600" : "text-red-600"}`}>
              {MENSAJES[data.resultado]}
            </p>
          )}
          {error && <p className="mb-3 text-sm text-red-600">Error de conexión. Intenta de nuevo.</p>}
          <div className="flex gap-2">
            <button
              type="button" onClick={onClose}
              className="flex-1 rounded-lg border px-4 py-2 text-slate-700"
            >
              Cancelar
            </button>
            <button
              type="submit" disabled={isPending || codigo.length !== 6}
              className="flex-1 rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-40"
            >
              {isPending ? "Validando…" : "Confirmar pago"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
