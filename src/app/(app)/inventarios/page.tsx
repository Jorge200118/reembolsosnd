"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { HistorialFolios } from "@/components/inventarios/HistorialFolios";
import { FichaSolicitud } from "@/components/inventarios/FichaSolicitud";
import { Segmentadores, useSegmentadores } from "@/components/ui/Segmentadores";
import { hayFiltros, type ConfigSegmentos } from "@/lib/filtros/segmentar";
import { totalesDe } from "@/lib/inventarios/evaluar";
import type { PartidaEvaluada, EstadoPartida } from "@/lib/inventarios/tipos";

// Pantalla del rol INVENTARIOS: lo entregado en uso interno que todavía no se
// descarga del ERP, y el botón que genera el folio de transacción 40.

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

type RespuestaPreview =
  | { ok: true; sucursales: SucursalPreview[] }
  | { ok: false; error: string };

/** Partida con su sucursal encima: la tabla está agrupada, los filtros no. */
type PartidaConSucursal = PartidaEvaluada & { sucursal: string };

const FILTROS_PENDIENTES: ConfigSegmentos<PartidaConSucursal> = {
  segmentos: [
    { id: "sucursal", etiqueta: "Sucursal", de: (p) => p.sucursal },
    {
      id: "estado",
      etiqueta: "Estado",
      de: (p) => p.estado,
      orden: ["ok", "insuficiente", "sin_existencia", "sin_catalogo", "servicio"],
      // El mismo texto de la etiqueta de la tabla: si el filtro dijera
      // "insuficiente" y la columna "Espera inventario", parecerían dos cosas.
      texto: (v) => ETIQUETA[v as EstadoPartida]?.texto ?? v,
    },
    { id: "area", etiqueta: "Área", de: (p) => p.area, orden: ["FERRETERIA", "NAVE1", "NAVE2", "NAVE3"] },
  ],
  buscarEn: (p) =>
    `${p.codProd} ${p.descripcionErp} ${p.descripcion} ${p.folioSolicitud} ${p.empleadoNombre} ${p.motivo}`,
  fechaDe: (p) => p.fechaEntrega,
};

/** Trae el preview. Fuera del componente y sin tocar estado: solo datos. */
async function pedirPreview(): Promise<RespuestaPreview> {
  try {
    const res = await fetch("/api/inventarios", { cache: "no-store" });
    const data = await res.json();
    if (!data.ok) return { ok: false, error: String(data.error ?? "No se pudo cargar") };
    return { ok: true, sucursales: data.sucursales as SucursalPreview[] };
  } catch {
    return { ok: false, error: "No se pudo conectar con el servidor" };
  }
}

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
  // Selección por sucursal: lineaId -> marcada. Solo entra lo que se descarga
  // completo; el resto ni se puede marcar (regla de todo o nada).
  const [sel, setSel] = useState<Record<string, Set<string>>>({});
  const [confirmar, setConfirmar] = useState<SucursalPreview | null>(null);
  const [aplicando, setAplicando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [pestana, setPestana] = useState<"pendientes" | "historial">("pendientes");
  // Folio cuya ficha está abierta. Descargar el ERP no se deshace con un botón,
  // así que hay que poder ver quién autorizó y con qué evidencia se entregó
  // antes de aplicar.
  const [ficha, setFicha] = useState<string | null>(null);

  // El estado se aplica SIEMPRE dentro de un .then, nunca en el cuerpo del
  // efecto: hacerlo de forma síncrona ahí encadena renders (regla
  // react-hooks/set-state-in-effect). Por eso `pedirPreview` vive fuera del
  // componente y no sabe nada de React.
  const asentar = useCallback((r: RespuestaPreview) => {
    setCargando(false);
    if (!r.ok) {
      setError(r.error);
      setSucursales([]);
      return;
    }
    setError("");
    setSucursales(r.sucursales);
    const inicial: Record<string, Set<string>> = {};
    for (const s of r.sucursales) {
      inicial[s.sucursal] = new Set(
        s.partidas.filter((p) => p.seleccionablePorDefecto).map((p) => p.lineaId),
      );
    }
    setSel(inicial);
  }, []);

  useEffect(() => {
    let vivo = true;
    void pedirPreview().then((r) => { if (vivo) asentar(r); });
    return () => { vivo = false; };
  }, [asentar]);

  const recargar = useCallback(() => pedirPreview().then(asentar), [asentar]);

  // Los filtros trabajan sobre la lista PLANA (una partida es una partida,
  // venga de la sucursal que venga); la tabla sigue agrupada. Por eso se filtra
  // plano y luego cada tarjeta se queda con lo suyo.
  const todasLasPartidas = useMemo(
    () => sucursales.flatMap((s) => s.partidas.map((p) => ({ ...p, sucursal: s.sucursal }))),
    [sucursales],
  );
  const {
    estado: filtros,
    setEstado: setFiltros,
    filtrados,
  } = useSegmentadores(todasLasPartidas, FILTROS_PENDIENTES);
  // Sin filtros esto contiene TODO, así que el resto del código puede usarlo
  // siempre sin preguntarse si hay filtro activo.
  const visibles = useMemo(() => new Set(filtrados.map((p) => p.lineaId)), [filtrados]);
  const filtrando = hayFiltros(filtros);

  const aplicar = async (s: SucursalPreview) => {
    // Marcadas Y a la vista. Aplicar a BMS una partida que un filtro está
    // escondiendo es exactamente cómo se descarga material que nadie revisó.
    const marcadas = sel[s.sucursal] ?? new Set<string>();
    const ids = s.partidas
      .filter((p) => marcadas.has(p.lineaId) && visibles.has(p.lineaId))
      .map((p) => p.lineaId);
    setAplicando(true);
    setAviso(null);
    try {
      const res = await fetch("/api/inventarios/aplicar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sucursal: s.sucursal, lineaIds: ids }),
      });
      const data = await res.json();
      if (data.ok) {
        setAviso({
          tipo: "ok",
          texto: `Folio ${data.folio} generado en el ERP: ${data.partidas} ${data.partidas === 1 ? "partida" : "partidas"}, ${data.unidades} uds.`,
        });
      } else {
        // El detalle importa: "no alcanzó" necesita decir de qué producto, o
        // quien lo lee no sabe qué revisar.
        const det = Array.isArray(data.detalle) && data.detalle.length
          ? " (" + data.detalle.map((d: { codProd?: string }) => d.codProd).filter(Boolean).join(", ") + ")"
          : "";
        setAviso({ tipo: "error", texto: (data.error ?? "No se pudo aplicar") + det });
      }
    } catch {
      setAviso({ tipo: "error", texto: "No se pudo conectar con el servidor" });
    } finally {
      setAplicando(false);
      setConfirmar(null);
      // Se recarga pase lo que pase: si salió bien, esas partidas ya no van; si
      // salió mal, las existencias que se ven pudieron haber cambiado.
      void recargar();
    }
  };

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

  const tab = (id: "pendientes" | "historial", texto: string) => (
    <button
      type="button"
      onClick={() => setPestana(id)}
      className={`border-b-2 px-1 pb-2 text-sm font-medium transition-colors ${
        pestana === id
          ? "border-emerald-600 text-emerald-700"
          : "border-transparent text-slate-500 hover:text-slate-700"
      }`}
    >
      {texto}
    </button>
  );

  const encabezado = (
    <>
      <PageHeader
        titulo="Inventarios"
        subtitulo="Uso interno entregado y su descarga del ERP"
      />
      <div className="mb-5 flex gap-6 border-b border-slate-200">
        {tab("pendientes", "Por descargar")}
        {tab("historial", "Historial")}
      </div>
    </>
  );

  // El historial se monta aparte: trae sus propios datos y no depende de la
  // consulta al ERP, así que se puede ver aunque el ERP esté caído.
  if (pestana === "historial") {
    return <div>{encabezado}<HistorialFolios /></div>;
  }

  if (cargando) {
    return (
      <div>
        {encabezado}
        <Card className="p-8 text-center text-sm text-slate-500">Consultando el ERP…</Card>
      </div>
    );
  }

  return (
    <div>
      {encabezado}

      {/* El resultado de aplicar va arriba y se queda: es la única constancia
          del folio que se generó, y hay que poder anotarlo. */}
      {aviso && (
        <div
          className={`mb-5 flex items-start justify-between gap-4 rounded-lg border px-4 py-3 text-sm ${
            aviso.tipo === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          <span>{aviso.texto}</span>
          <button
            type="button"
            onClick={() => setAviso(null)}
            className="shrink-0 text-xs underline opacity-70 hover:opacity-100"
          >
            cerrar
          </button>
        </div>
      )}

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

      {totalPendientes > 0 && (
        <Segmentadores
          items={todasLasPartidas}
          config={FILTROS_PENDIENTES}
          estado={filtros}
          onCambiar={setFiltros}
          mostrados={filtrados.length}
          sustantivo="partidas"
        />
      )}

      {filtrando && filtrados.length === 0 && (
        <Card className="p-8 text-center text-sm text-slate-500">
          Ninguna partida coincide con los filtros.
        </Card>
      )}

      <div className="space-y-6">
        {sucursales
          // Con filtros activos, una sucursal sin partidas a la vista no pinta
          // nada. Sin filtros se deja pasar aunque venga vacía: puede traer un
          // aviso de bloqueo que sí hay que leer.
          .filter((s) => !filtrando || s.partidas.some((p) => visibles.has(p.lineaId)))
          .map((s) => {
          const marcadas = sel[s.sucursal] ?? new Set<string>();
          const partidas = s.partidas.filter((p) => visibles.has(p.lineaId));
          const totales = totalesDe(partidas.filter((p) => marcadas.has(p.lineaId)));
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
                    {partidas.length} {partidas.length === 1 ? "partida pendiente" : "partidas pendientes"}
                    {filtrando && partidas.length !== s.partidas.length && (
                      <span className="text-slate-400"> · de {s.partidas.length} en total</span>
                    )}
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

              {partidas.length > 0 && (
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
                      {partidas.map((p) => {
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
                              <button
                                type="button"
                                onClick={() => setFicha(p.folioSolicitud)}
                                className="font-mono text-blue-700 underline underline-offset-2 hover:text-blue-900"
                              >
                                {p.folioSolicitud}
                              </button>
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
                {totales.partidas === 0 && !s.bloqueo && (
                  <span className="text-xs text-slate-500">Selecciona al menos una partida</span>
                )}
                <button
                  type="button"
                  onClick={() => setConfirmar(s)}
                  disabled={aplicando || totales.partidas === 0 || Boolean(s.bloqueo)}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  Aplicar a BMS
                </button>
              </div>
            </Card>
          );
        })}
      </div>

      {/* key={ficha}: cambiar de folio remonta y vuelve a pedir, sin resetear
          estado a mano dentro del efecto. */}
      {ficha && <FichaSolicitud key={ficha} folio={ficha} onCerrar={() => setFicha(null)} />}

      {/* Afectar inventario del ERP no se deshace con un botón: hay que
          cancelar el folio. Por eso se confirma, y el mensaje dice exactamente
          qué va a pasar y cuánto. */}
      {confirmar && (() => {
        const marcadas = sel[confirmar.sucursal] ?? new Set<string>();
        // Mismo criterio que `aplicar`: marcadas Y a la vista. Si el diálogo
        // contara las escondidas, diría un número y se aplicaría otro.
        const t = totalesDe(
          confirmar.partidas.filter((p) => marcadas.has(p.lineaId) && visibles.has(p.lineaId)),
        );
        return (
          <ConfirmDialog
            titulo={`Aplicar a BMS — ${confirmar.sucursal}`}
            mensaje={
              <>
                Se va a generar un folio de <strong>disminución de inventario</strong>{" "}
                (transacción 40, razón <em>Uso Interno</em>) en el establecimiento{" "}
                <strong>{confirmar.codEstab}</strong> con{" "}
                <strong>{t.partidas} {t.partidas === 1 ? "partida" : "partidas"}</strong> y{" "}
                <strong>{t.unidades} unidades</strong>, por {PESOS.format(t.costo)}.
                <br />
                <br />
                El inventario del ERP baja de inmediato. Para revertirlo hay que cancelar
                el folio en BMS.
              </>
            }
            textoConfirmar="Aplicar"
            isPending={aplicando}
            onCancelar={() => setConfirmar(null)}
            onConfirmar={() => void aplicar(confirmar)}
          />
        );
      })()}
    </div>
  );
}
