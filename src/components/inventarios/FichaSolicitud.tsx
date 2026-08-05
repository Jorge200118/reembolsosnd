"use client";
import { useEffect, useState } from "react";

// El modal que abre INVENTARIOS al hacer clic en un folio de solicitud: quién
// autorizó y las fotos de cada entrega.
//
// Mismo esqueleto que ComprobantesModal (fondo oscuro, Esc cierra, clic afuera
// cierra) pero componente aparte: aquél está amarrado al tipo `Fila` de
// reembolsos y a `normalizarArchivos`, vocabulario que aquí no aplica.

export interface EntregaVista {
  area: string | null;
  entregadoPor: string | null;
  fechaEntrega: string | null;
  /** false = nunca hubo foto. true con url null = la hay y no se pudo abrir. */
  tieneFoto: boolean;
  url: string | null;
}

export interface FichaVista {
  folio: string;
  sucursal: string;
  empleadoNombre: string;
  motivo: string;
  estado: string;
  autorizadoPor: string | null;
  fechaAutorizacion: string | null;
  entregas: EntregaVista[];
}

const FECHA = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
});

function fecha(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : FECHA.format(d);
}

type Resultado = { ok: true; ficha: FichaVista } | { ok: false; error: string };

/** Trae la ficha. Fuera del componente y sin tocar estado: solo datos. */
async function pedirFicha(folio: string): Promise<Resultado> {
  try {
    const res = await fetch(`/api/inventarios/ficha?folio=${encodeURIComponent(folio)}`, {
      cache: "no-store",
    });
    const data = await res.json();
    if (!data.ok) return { ok: false, error: String(data.error ?? "No se pudo cargar la solicitud") };
    return { ok: true, ficha: data.ficha as FichaVista };
  } catch {
    return { ok: false, error: "No se pudo conectar con el servidor" };
  }
}

function Dato({ termino, valor }: { termino: string; valor: string }) {
  return (
    <div className="flex gap-3">
      <dt className="w-20 shrink-0 text-slate-500">{termino}</dt>
      <dd className="text-slate-800">{valor}</dd>
    </div>
  );
}

/**
 * @param folio el de la solicitud (SUI-000050). Móntalo con `key={folio}`: así
 * cambiar de folio remonta y vuelve a pedir, sin tener que resetear estado a
 * mano dentro del efecto (que encadenaría renders).
 */
export function FichaSolicitud({ folio, onCerrar }: { folio: string; onCerrar: () => void }) {
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [ampliada, setAmpliada] = useState<string | null>(null);

  // El estado se asienta SIEMPRE dentro del .then, igual que en la página de
  // inventarios: hacerlo síncrono en el cuerpo del efecto encadena renders
  // (regla react-hooks/set-state-in-effect).
  useEffect(() => {
    let vivo = true;
    void pedirFicha(folio).then((r) => { if (vivo) setResultado(r); });
    return () => { vivo = false; };
  }, [folio]);

  // Esc cierra primero la foto ampliada y luego la ficha; si cerrara las dos de
  // un golpe, ampliar una foto sería un callejón sin salida.
  useEffect(() => {
    function alTeclear(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (ampliada) setAmpliada(null);
      else onCerrar();
    }
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [ampliada, onCerrar]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onCerrar}
      role="dialog"
      aria-modal="true"
      aria-label={`Solicitud ${folio}`}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 className="font-mono text-lg font-bold text-slate-900">{folio}</h2>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="shrink-0 rounded-lg px-2 py-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            ✕
          </button>
        </div>

        {!resultado && <p className="mt-6 text-sm text-slate-500">Cargando…</p>}

        {resultado && !resultado.ok && (
          <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {resultado.error}
          </p>
        )}

        {resultado?.ok && (
          <>
            <dl className="mt-4 space-y-1.5 text-sm">
              <Dato
                termino="Pidió"
                valor={`${resultado.ficha.empleadoNombre} · ${resultado.ficha.sucursal}`}
              />
              <Dato termino="Motivo" valor={resultado.ficha.motivo ? `“${resultado.ficha.motivo}”` : "—"} />
              <Dato
                termino="Autorizó"
                valor={
                  resultado.ficha.autorizadoPor
                    ? `${resultado.ficha.autorizadoPor} · ${fecha(resultado.ficha.fechaAutorizacion)}`
                    : "—"
                }
              />
            </dl>

            <h3 className="mt-5 border-t border-slate-200 pt-4 text-sm font-semibold text-slate-900">
              Entregas
            </h3>
            <ul className="mt-2 space-y-4">
              {resultado.ficha.entregas.map((e, i) => (
                <li key={`${e.area ?? "sin-area"}-${i}`}>
                  <p className="text-xs text-slate-600">
                    <span className="font-semibold text-slate-800">{e.area ?? "Sin área"}</span>
                    {" · "}
                    {e.entregadoPor ?? "—"}
                    {" · "}
                    {fecha(e.fechaEntrega)}
                  </p>

                  {/* Los dos mensajes NO son intercambiables: uno afirma que no
                      hubo evidencia, el otro que la hay y no se alcanzó a
                      mostrar. Confundirlos sería el peor error de esta pantalla. */}
                  {!e.tieneFoto && (
                    <p className="mt-1 text-xs italic text-slate-400">sin foto registrada</p>
                  )}
                  {e.tieneFoto && !e.url && (
                    <p className="mt-1 text-xs italic text-amber-700">no se pudo abrir la foto</p>
                  )}
                  {e.url && (
                    <button
                      type="button"
                      onClick={() => setAmpliada(e.url)}
                      className="mt-1 block rounded-lg ring-offset-2 transition hover:opacity-80"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada de Supabase que caduca; next/image no aplica */}
                      <img
                        src={e.url}
                        alt={`Evidencia de la entrega ${e.area ?? "sin área"}`}
                        className="h-24 w-24 rounded-lg object-cover ring-1 ring-slate-200"
                      />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {ampliada && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 p-4"
          // stopPropagation: sin esto el clic para cerrar la foto ampliada
          // llegaría al fondo de la ficha y cerraría las dos cosas.
          onClick={(e) => { e.stopPropagation(); setAmpliada(null); }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- ídem */}
          <img
            src={ampliada}
            alt="Evidencia de entrega ampliada"
            className="max-h-[90vh] max-w-full rounded-lg"
          />
        </div>
      )}
    </div>
  );
}
