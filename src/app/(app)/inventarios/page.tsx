"use client";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { totalesDe } from "@/lib/inventarios/evaluar";
import type { PartidaEvaluada, EstadoPartida } from "@/lib/inventarios/tipos";

// FASE 1: pantalla de SOLO LECTURA. Muestra lo entregado que aún no se descarga
// del ERP y arma el preview del folio que se generaría. No escribe nada.

interface SucursalPreview {
  sucursal: string;
  codEstab: number | null;
  partidas: PartidaEvaluada[];
  permiteNegativo: boolean;
  bloqueo: string | null;
}

const PESOS = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

// Cada estado dice qué pasaría en BMS, no solo si está "bien" o "mal".
const ETIQUETA: Record<EstadoPartida, { texto: string; clase: string }> = {
  ok:             { texto: "Se descarga",       clase: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  // "Espera" y no "alcanza parcial": con la regla de todo o nada, una partida
  // que no cabe completa no descarga nada, se queda hasta que entre mercancía.
  insuficiente:   { texto: "Espera inventario", clase: "bg-amber-50 text-amber-800 ring-amber-600/20" },
  sin_existencia: { texto: "Sin existencia",    clase: "bg-rose-50 text-rose-700 ring-rose-600/20" },
  sin_catalogo:   { texto: "No está en el ERP", clase: "bg-slate-100 text-slate-600 ring-slate-500/20" },
  servicio:       { texto: "Es servicio",      clase: "bg-slate-100 text-slate-600 ring-slate-500/20" },
};

function Etiqueta({ estado }: { estado: EstadoPartida }) {
  const e = ETIQUETA[estado];
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${e.clase}`}>
      {e.texto}
    </span>
  );
}

export default function InventariosPage() {
  const [sucursales, setSucursales] = useState<SucursalPreview[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  // Selección por sucursal: lineaId -> marcada. Arranca con lo que se descarga
  // completo; lo que tiene pero se puede marcar a mano y a conciencia.
  const [sel, setSel] = useState<Record<string, Set<string>>>({});

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const res = await fetch("/api/inventarios", { cache: "no-store" });
        const data = await res.json();
        if (!vivo) return;
        if (!data.ok) {
          setError(data.error ?? "No se pudo cargar");
        } else {
          const subs = data.sucursales as SucursalPreview[];
          setSucursales(subs);
          const inicial: Record<string, Set<string>> = {};
          for (const s of subs) {
            inicial[s.sucursal] = new Set(
              s.partidas.filter((p) => p.seleccionablePorDefecto).map((p) => p.lineaId),
            );
          }
          setSel(inicial);
        }
      } catch {
        if (vivo) setError("No se pudo conectar con el servidor");
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => { vivo = false; };
  }, []);

  const alternar = (sucursal: string, lineaId: string) => {
    setSel((prev) => {
      const set = new Set(prev[sucursal] ?? []);
      if (set.has(lineaId)) set.delete(lineaId);
      else set.add(lineaId);
      return { ...prev, [sucursal]: set };
    });
  };

  const totalPendientes = useMemo(
    () => sucursales.reduce((n, s) => n + s.partidas.length, 0),
    [sucursales],
  );

  if (cargando) {
    return (
      <div>
        <PageHeader titulo="Inventarios" subtitulo="Cargando entregas…" />
        <Card className="p-8 text-center text-sm text-slate-500">Consultando el ERP…</Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        titulo="Inventarios"
        subtitulo="Uso interno entregado que todavía no se descarga del ERP"
      />

      {/* Que quede claro que todavía no escribe nada: alguien podría pensar que
          ya afectó BMS y dejar de capturarlo a mano. */}
      <div className="mb-5 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
        <strong className="font-semibold">Vista previa.</strong> Aquí ves el folio que se
        generaría en el ERP (transacción 40, razón <em>Uso Interno</em>), pero todavía
        <strong> no se aplica nada</strong>. Sigue capturándolo en BMS como hasta ahora y
        compara los números con esta pantalla.
      </div>

      {error && (
        <div className="mb-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      {!error && totalPendientes === 0 && (
        <Card className="p-8 text-center">
          <p className="text-sm font-medium text-slate-700">No hay nada pendiente de descargar</p>
          <p className="mt-1 text-sm text-slate-500">
            Aquí aparecerá el material de uso interno en cuanto una solicitud quede entregada por completo.
          </p>
        </Card>
      )}

      <div className="space-y-6">
        {sucursales.map((s) => {
          const marcadas = sel[s.sucursal] ?? new Set<string>();
          const totales = totalesDe(s.partidas.filter((p) => marcadas.has(p.lineaId)));
          return (
            <Card key={s.sucursal} className="overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    {s.sucursal}
                    {s.codEstab !== null && (
                      <span className="ml-2 font-normal text-slate-500">establecimiento {s.codEstab}</span>
                    )}
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {s.partidas.length} {s.partidas.length === 1 ? "partida" : "partidas"} pendientes
                  </p>
                </div>
                <div className="text-right text-sm">
                  <div className="font-semibold text-slate-900">
                    {totales.partidas} {totales.partidas === 1 ? "partida" : "partidas"} · {totales.unidades} uds
                  </div>
                  <div className="text-slate-600">{PESOS.format(totales.costo)}</div>
                </div>
              </div>

              {s.bloqueo && (
                <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
                  {s.bloqueo}
                </div>
              )}

              {/* El ERP dejaría negativo en esta sucursal. La pantalla avisa
                  igual para que el criterio no cambie de sucursal a sucursal. */}
              {s.permiteNegativo && (
                <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-600">
                  En esta sucursal el ERP permite existencia negativa: dejaría pasar
                  descargas sin inventario en vez de recortarlas.
                </div>
              )}

              {s.partidas.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                        <th className="w-10 px-4 py-2" />
                        <th className="px-3 py-2 font-medium">Código</th>
                        <th className="px-3 py-2 font-medium">Producto</th>
                        <th className="px-3 py-2 text-right font-medium">Entregado</th>
                        <th className="px-3 py-2 text-right font-medium">Existencia</th>
                        <th className="px-3 py-2 text-right font-medium">Se descarga</th>
                        <th className="px-3 py-2 font-medium">Estado</th>
                        <th className="px-3 py-2 font-medium">Solicitud</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.partidas.map((p) => {
                        const marcada = marcadas.has(p.lineaId);
                        // Todo o nada: una partida que no cabe completa espera a
                        // que entre mercancía. Descargar solo lo que alcanza
                        // dejaría el resto mal para siempre, y el caso parcial es
                        // una señal (se entregó material que el ERP no tenía) que
                        // conviene dejar visible en vez de aplanar.
                        const inerte = p.estado !== "ok";
                        return (
                          <tr
                            key={p.lineaId}
                            className={`border-b border-slate-100 last:border-0 ${marcada ? "bg-emerald-50/40" : ""}`}
                          >
                            <td className="px-4 py-2">
                              <input
                                type="checkbox"
                                checked={marcada}
                                disabled={inerte}
                                onChange={() => alternar(s.sucursal, p.lineaId)}
                                className="h-4 w-4 rounded border-slate-300 text-emerald-600 disabled:opacity-30"
                                aria-label={`Seleccionar ${p.codProd}`}
                              />
                            </td>
                            <td className="px-3 py-2 font-mono text-xs text-slate-700">{p.codProd}</td>
                            <td className="px-3 py-2 text-slate-800">
                              {p.descripcionErp || p.descripcion}
                              {p.area && <span className="ml-2 text-xs text-slate-400">{p.area}</span>}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                              {p.cantidad} {p.unidad ?? ""}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                              {p.existencia ?? "—"}
                            </td>
                            {/* Solo lo que va completo llega al ERP, así que
                                cualquier otro estado descarga cero. Mostrar aquí
                                lo que "alcanzaría" haría creer que algo se va a
                                mover cuando no. */}
                            <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-900">
                              {p.estado === "ok" ? p.cantidad : <span className="font-normal text-slate-400">—</span>}
                            </td>
                            <td className="px-3 py-2"><Etiqueta estado={p.estado} /></td>
                            <td className="px-3 py-2 text-xs text-slate-500">
                              <div className="font-mono">{p.folioSolicitud}</div>
                              <div>{p.empleadoNombre}</div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3">
                <span className="text-xs text-slate-500">Aplicar a BMS se habilita en la siguiente fase</span>
                <button
                  type="button"
                  disabled
                  className="cursor-not-allowed rounded-lg bg-slate-300 px-4 py-2 text-sm font-semibold text-white"
                  title="Todavía no disponible: esta fase es solo de verificación"
                >
                  Aplicar a BMS
                </button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
