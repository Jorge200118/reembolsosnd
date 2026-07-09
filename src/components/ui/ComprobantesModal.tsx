"use client";
import type { Archivo } from "@devoluciones/domain";

export interface ComprobantesModalProps {
  titulo: string;            // ej. "Victor Hugo Diaz - $25"
  subtitulo?: string;        // ej. "ESTACIONAMIENTO · 25/6/2026"
  archivos: Archivo[];       // ya normalizados
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

export function ComprobantesModal({ titulo, subtitulo, archivos, onClose }: ComprobantesModalProps) {
  const varios = archivos.length > 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="max-w-3xl w-full max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-slate-800">{titulo}</h2>
        {subtitulo && <p className="mt-0.5 text-sm text-slate-500">{subtitulo}</p>}

        <div className="mt-4 space-y-5">
          {archivos.length === 0 ? (
            <p className="text-sm text-slate-400">Este reembolso no tiene comprobantes.</p>
          ) : (
            archivos.map((a, i) => {
              const tipo = tipoArchivo(a);
              return (
                <div key={i} className="space-y-2">
                  {varios && (
                    <p className="text-sm font-medium text-slate-700 break-all">{a.nombre}</p>
                  )}
                  {tipo === "imagen" && (
                    <a href={a.url} target="_blank" rel="noopener noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element -- comprobantes vienen de URLs firmadas de Supabase; next/image no aplica */}
                      <img
                        src={a.url}
                        alt={a.nombre}
                        className="max-h-[70vh] w-auto mx-auto rounded-lg"
                      />
                    </a>
                  )}
                  {tipo === "pdf" && (
                    <iframe src={a.url} className="w-full h-[75vh] rounded-lg border" title={a.nombre} />
                  )}
                  {tipo === "otro" && (
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
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="mt-6 flex justify-end">
          <button onClick={onClose} className="rounded-lg border px-4 py-2 text-slate-700">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
