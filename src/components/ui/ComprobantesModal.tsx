"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Archivo } from "@devoluciones/domain";
import { parseMonto, formatMXN, normalizarArchivos } from "@devoluciones/domain";
import type { Fila } from "@/lib/reportes/agruparPorLote";

export interface ComprobantesModalProps {
  reembolsos: Fila[];        // todas las filas visibles de la tabla/lote
  indiceInicial: number;     // fila sobre la que se hizo click
  onClose: () => void;
}

// Detecta el tipo de archivo por la extensión del url o del nombre (case-insensitive).
const ES_IMAGEN = /\.(jpe?g|png|gif|webp|bmp|heic)(\?|$)/i;
const ES_PDF = /\.pdf(\?|$)/i;

function tipoArchivo(a: Archivo): "imagen" | "pdf" | "otro" {
  if (ES_IMAGEN.test(a.url) || ES_IMAGEN.test(a.nombre)) return "imagen";
  if (ES_PDF.test(a.url) || ES_PDF.test(a.nombre)) return "pdf";
  return "otro";
}

// Un elemento navegable = un comprobante de una fila. Las filas sin comprobantes
// aportan un elemento con archivo=null (para mostrar el estado vacío sin romper
// la navegación entre filas).
interface Vista {
  titulo: string;
  subtitulo?: string;
  archivo: Archivo | null;
}

function tituloDeFila(r: Fila): { titulo: string; subtitulo?: string } {
  const nombre = String(r.nombre_beneficiario ?? "");
  const monto = formatMXN(parseMonto(r.monto as number));
  const concepto = String(r.concepto ?? "");
  const fecha = r.fecha ? new Date(String(r.fecha) + "T12:00:00").toLocaleDateString("es-MX") : "";
  const subtitulo = [concepto, fecha].filter(Boolean).join(" · ");
  return { titulo: `${nombre} - ${monto}`, subtitulo: subtitulo || undefined };
}

// Aplana las filas a una lista de vistas (una por comprobante). Devuelve además,
// para cada fila, el índice de su PRIMER comprobante, para poder saltar a la
// fila clickeada al abrir.
function aplanar(reembolsos: Fila[]): { vistas: Vista[]; inicioDeFila: number[] } {
  const vistas: Vista[] = [];
  const inicioDeFila: number[] = [];
  for (const r of reembolsos) {
    const { titulo, subtitulo } = tituloDeFila(r);
    const archivos = normalizarArchivos(r.archivos);
    inicioDeFila.push(vistas.length);
    if (archivos.length === 0) {
      vistas.push({ titulo, subtitulo, archivo: null });
    } else {
      for (const archivo of archivos) vistas.push({ titulo, subtitulo, archivo });
    }
  }
  return { vistas, inicioDeFila };
}

export function ComprobantesModal({ reembolsos, indiceInicial, onClose }: ComprobantesModalProps) {
  const { vistas, inicioDeFila } = useMemo(() => aplanar(reembolsos), [reembolsos]);

  // Índice inicial: primer comprobante de la fila clickeada (acotado al rango).
  const idxSeguro = Math.min(Math.max(indiceInicial, 0), Math.max(reembolsos.length - 1, 0));
  const [indice, setIndice] = useState(() => inicioDeFila[idxSeguro] ?? 0);

  const total = vistas.length;
  const hayAnterior = indice > 0;
  const haySiguiente = indice < total - 1;

  const anterior = useCallback(() => setIndice((i) => (i > 0 ? i - 1 : i)), []);
  const siguiente = useCallback(() => setIndice((i) => (i < total - 1 ? i + 1 : i)), [total]);

  // Teclado: ← / → navegan, Esc cierra. preventDefault en flechas evita scrollear.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") { e.preventDefault(); anterior(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); siguiente(); }
      else if (e.key === "Escape") { onClose(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [anterior, siguiente, onClose]);

  const vista = vistas[indice];
  const varios = total > 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative max-w-3xl w-full max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-slate-800">{vista?.titulo ?? ""}</h2>
        {vista?.subtitulo && <p className="mt-0.5 text-sm text-slate-500">{vista.subtitulo}</p>}

        <div className="relative mt-4">
          {varios && (
            <>
              <button
                type="button"
                onClick={anterior}
                disabled={!hayAnterior}
                aria-label="Comprobante anterior"
                className="absolute left-1 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/90 p-2 text-slate-700 shadow-md ring-1 ring-slate-200 transition hover:bg-white disabled:cursor-default disabled:opacity-30"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </button>
              <button
                type="button"
                onClick={siguiente}
                disabled={!haySiguiente}
                aria-label="Comprobante siguiente"
                className="absolute right-1 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/90 p-2 text-slate-700 shadow-md ring-1 ring-slate-200 transition hover:bg-white disabled:cursor-default disabled:opacity-30"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>
            </>
          )}

          {vista?.archivo == null ? (
            <p className="py-10 text-center text-sm text-slate-400">Este reembolso no tiene comprobantes.</p>
          ) : (() => {
            const a = vista.archivo;
            const tipo = tipoArchivo(a);
            if (tipo === "imagen") {
              return (
                <a href={a.url} target="_blank" rel="noopener noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element -- comprobantes vienen de URLs firmadas de Supabase; next/image no aplica */}
                  <img src={a.url} alt={a.nombre} className="max-h-[70vh] w-auto mx-auto rounded-lg" />
                </a>
              );
            }
            if (tipo === "pdf") {
              return <iframe src={a.url} className="w-full h-[75vh] rounded-lg border" title={a.nombre} />;
            }
            return (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="mb-2 text-sm text-slate-700 break-all">{a.nombre}</p>
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  Abrir archivo
                </a>
              </div>
            );
          })()}
        </div>

        <div className="mt-6 flex items-center justify-between">
          {varios ? (
            <span className="text-xs text-slate-400">{indice + 1} / {total}</span>
          ) : (
            <span />
          )}
          <button onClick={onClose} className="rounded-lg border px-4 py-2 text-slate-700">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
