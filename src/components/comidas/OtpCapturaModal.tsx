"use client";
import { useState } from "react";
import { useValidarOtp } from "@/lib/hooks/useValidarOtp";
import { useGuardedAction } from "@/lib/hooks/useGuardedAction";
import type { ResultadoOtp } from "@/lib/edge/otpComidas";

const MENSAJES: Record<ResultadoOtp, string> = {
  ok: "✅ Pago liberado correctamente.",
  no_encontrado: "No hay código generado para este empleado esta semana.",
  expirado: "El código ya venció.",
  ya_usado: "Este código ya se usó (el pago ya se liberó).",
  sin_intentos: "Demasiados intentos fallidos. El empleado debe volver a abrir su app para obtener un código nuevo.",
  codigo_incorrecto: "Código incorrecto. Verifica e intenta de nuevo.",
  sin_comidas: "Este empleado ya no tiene comidas pendientes. No se pagó nada y el código sigue disponible.",
};

function moneda(n: number): string {
  return "$" + n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

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

  // Pago exitoso: mostramos el monto REALMENTE liquidado y NO cerramos solos, para
  // que la cajera entregue exactamente ese efectivo antes de continuar.
  const exito = data?.ok === true;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    mutate({ empleadoId, codigo: codigo.trim(), cajeraEmail });
  }

  // Guard síncrono contra doble-tap veloz (además del disabled={isPending}).
  const enviar = useGuardedAction(onSubmit);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-1 text-lg font-bold text-slate-800">Cobro de comidas</h2>
        <p className="mb-4 text-sm text-slate-700">{empleadoNombre}</p>

        {exito ? (
          <div>
            <div className="mb-4 rounded-xl border border-green-200 bg-green-50 p-4 text-center">
              <div className="text-sm font-medium text-green-700">Pago liberado</div>
              <div className="mt-1 text-2xl font-bold tabular-nums text-green-800">
                {moneda(data?.total ?? 0)}
              </div>
              <div className="mt-1 text-sm text-green-700">
                {data?.comidas ?? 0} comida{(data?.comidas ?? 0) !== 1 ? "s" : ""} · entrégale este efectivo
              </div>
            </div>
            <button
              type="button" onClick={onExito}
              className="w-full rounded-lg bg-green-600 px-4 py-2 font-semibold text-white"
            >
              Listo
            </button>
          </div>
        ) : (
          <form onSubmit={enviar}>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Código que el empleado recibió por WhatsApp
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
            {data && !data.ok && (
              <p className="mb-3 text-sm text-red-600">{MENSAJES[data.resultado]}</p>
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
        )}
      </div>
    </div>
  );
}
