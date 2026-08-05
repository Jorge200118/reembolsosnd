"use client";
import { useEffect, useState, useCallback } from "react";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { FichaSolicitud } from "@/components/inventarios/FichaSolicitud";
import { Segmentadores, useSegmentadores } from "@/components/ui/Segmentadores";
import type { ConfigSegmentos } from "@/lib/filtros/segmentar";
import type { FolioHistorial, PartidaHistorial } from "@/lib/inventarios/historial";

const PESOS = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const FECHA = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
});

function fecha(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : FECHA.format(d);
}

const ESTADO: Record<FolioHistorial["estado"], { texto: string; clase: string }> = {
  aplicada:   { texto: "Aplicada",   clase: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  cancelada:  { texto: "Cancelada",  clase: "bg-slate-100 text-slate-600 ring-slate-500/20" },
  // Se ve distinto a propósito: es lo único que pide acción de alguien.
  en_proceso: { texto: "Sin confirmar", clase: "bg-amber-50 text-amber-800 ring-amber-600/20" },
  fallida:    { texto: "No se aplicó", clase: "bg-rose-50 text-rose-700 ring-rose-600/20" },
};

// Aquí el estado SÍ es un segmentador propio y no una pestaña: un folio
// cancelado y uno sin confirmar conviven en la misma lista, y "enséñame los
// sin confirmar" es justo la pregunta que trae a alguien a esta pantalla.
const FILTROS_FOLIOS: ConfigSegmentos<FolioHistorial> = {
  segmentos: [
    {
      id: "estado",
      etiqueta: "Estado",
      de: (f) => f.estado,
      orden: ["aplicada", "en_proceso", "cancelada", "fallida"],
      texto: (v) => ESTADO[v as FolioHistorial["estado"]]?.texto ?? v,
    },
    { id: "sucursal", etiqueta: "Sucursal", de: (f) => f.sucursal },
  ],
  buscarEn: (f) => `${f.folioBms ?? ""} ${f.foliosSolicitud ?? ""} ${f.aplicadoPor}`,
  fechaDe: (f) => f.aplicadoEn,
};

export function HistorialFolios() {
  const [folios, setFolios] = useState<FolioHistorial[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [abierto, setAbierto] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<Record<string, PartidaHistorial[]>>({});
  const [porCancelar, setPorCancelar] = useState<FolioHistorial | null>(null);
  const [cancelando, setCancelando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  // Folio de solicitud cuya ficha está abierta: quién autorizó y las
  // evidencias. Sirve para auditar un folio de BMS ya aplicado.
  const [ficha, setFicha] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    const res = await fetch("/api/inventarios/historial", { cache: "no-store" });
    const data = await res.json();
    if (data.ok) setFolios(data.folios as FolioHistorial[]);
  }, []);

  const cancelar = async (f: FolioHistorial, motivo?: string) => {
    setCancelando(true);
    setAviso(null);
    try {
      const res = await fetch("/api/inventarios/cancelar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: f.id, motivo: motivo ?? "" }),
      });
      const data = await res.json();
      setAviso(data.ok
        ? { tipo: "ok", texto: `Folio ${data.folio} cancelado en el ERP. El material vuelve a estar por descargar.` }
        : { tipo: "error", texto: String(data.error ?? "No se pudo cancelar") });
    } catch {
      setAviso({ tipo: "error", texto: "No se pudo conectar con el servidor" });
    } finally {
      setCancelando(false);
      setPorCancelar(null);
      void recargar();
    }
  };

  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const res = await fetch("/api/inventarios/historial", { cache: "no-store" });
        const data = await res.json();
        return data.ok
          ? { ok: true as const, folios: data.folios as FolioHistorial[] }
          : { ok: false as const, error: String(data.error ?? "No se pudo cargar") };
      } catch {
        return { ok: false as const, error: "No se pudo conectar con el servidor" };
      }
    })().then((r) => {
      if (!vivo) return;
      setCargando(false);
      if (r.ok) setFolios(r.folios);
      else setError(r.error);
    });
    return () => { vivo = false; };
  }, []);

  const alternar = useCallback(async (id: string) => {
    if (abierto === id) { setAbierto(null); return; }
    setAbierto(id);
    if (detalle[id]) return;                       // ya se trajo antes
    try {
      const res = await fetch(`/api/inventarios/historial?id=${encodeURIComponent(id)}`, { cache: "no-store" });
      const data = await res.json();
      if (data.ok) setDetalle((prev) => ({ ...prev, [id]: data.partidas as PartidaHistorial[] }));
    } catch { /* el detalle es opcional: si falla, la fila sigue siendo útil */ }
  }, [abierto, detalle]);

  // Antes de los returns tempranos: las reglas de hooks no admiten que un
  // render se salte esta llamada y el siguiente no.
  const { estado: filtros, setEstado: setFiltros, filtrados } = useSegmentadores(
    folios,
    FILTROS_FOLIOS,
  );

  if (cargando) {
    return <Card className="p-8 text-center text-sm text-slate-500">Cargando historial…</Card>;
  }
  if (error) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
    );
  }
  if (folios.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm font-medium text-slate-700">Todavía no se ha descargado nada del ERP</p>
        <p className="mt-1 text-sm text-slate-500">Aquí aparecerán los folios conforme se apliquen.</p>
      </Card>
    );
  }

  // El aviso cuenta sobre TODOS los folios, no sobre los filtrados: si alguien
  // acota a "aplicada", los sin confirmar siguen existiendo y siguen exigiendo
  // que alguien los revise. Esconder ese aviso por un filtro sería lo peor que
  // podría hacer esta pantalla.
  const sinConfirmar = folios.filter((f) => f.estado === "en_proceso").length;

  return (
    <div className="space-y-4">
      {aviso && (
        <div
          className={`flex items-start justify-between gap-4 rounded-lg border px-4 py-3 text-sm ${
            aviso.tipo === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          <span>{aviso.texto}</span>
          <button type="button" onClick={() => setAviso(null)}
                  className="shrink-0 text-xs underline opacity-70 hover:opacity-100">cerrar</button>
        </div>
      )}

      {/* Un folio 'sin confirmar' significa que BMS pudo haber grabado y aquí no
          se registró. Es lo único de esta pantalla que exige que alguien vaya a
          revisar, así que se avisa arriba y no escondido en la tabla. */}
      {sinConfirmar > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong className="font-semibold">
            {sinConfirmar} {sinConfirmar === 1 ? "aplicación quedó sin confirmar" : "aplicaciones quedaron sin confirmar"}.
          </strong>{" "}
          Se perdió la respuesta del ERP a medio camino. Revisa en BMS si el folio existe:
          sus partidas siguen apartadas y no se van a volver a ofrecer hasta que se resuelva.
        </div>
      )}

      <Segmentadores
        items={folios}
        config={FILTROS_FOLIOS}
        estado={filtros}
        onCambiar={setFiltros}
        mostrados={filtrados.length}
        sustantivo="folios"
      />

      {filtrados.length === 0 && (
        <Card className="p-8 text-center text-sm text-slate-500">
          Ningún folio coincide con los filtros.
        </Card>
      )}

      <Card className={`overflow-hidden ${filtrados.length === 0 ? "hidden" : ""}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="w-8 px-3 py-2" />
                <th className="px-3 py-2 font-medium">Folio BMS</th>
                <th className="px-3 py-2 font-medium">Sucursal</th>
                <th className="px-3 py-2 text-right font-medium">Partidas</th>
                <th className="px-3 py-2 text-right font-medium">Unidades</th>
                <th className="px-3 py-2 text-right font-medium">Costo</th>
                <th className="px-3 py-2 font-medium">Estado</th>
                <th className="px-3 py-2 font-medium">Aplicó</th>
                <th className="px-3 py-2 font-medium">Solicitudes</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {filtrados.map((f) => (
                <FilaFolio
                  key={f.id}
                  folio={f}
                  abierto={abierto === f.id}
                  partidas={detalle[f.id]}
                  onAlternar={() => void alternar(f.id)}
                  onCancelar={() => setPorCancelar(f)}
                  onAbrirFicha={setFicha}
                  cancelando={cancelando}
                />
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {ficha && <FichaSolicitud key={ficha} folio={ficha} onCerrar={() => setFicha(null)} />}

      {porCancelar && (
        <ConfirmDialog
          titulo={`Cancelar folio ${porCancelar.folioBms}`}
          mensaje={
            <>
              Se va a cancelar el movimiento en el ERP: el inventario <strong>regresa</strong>{" "}
              ({porCancelar.unidades} unidades) y la póliza contable se da de baja.
              <br />
              <br />
              Las {porCancelar.partidas} {porCancelar.partidas === 1 ? "partida vuelve" : "partidas vuelven"}{" "}
              a la lista de por descargar, porque el material se entregó igual.
            </>
          }
          textoConfirmar="Cancelar folio"
          colorConfirmar="rojo"
          conMotivo
          isPending={cancelando}
          onCancelar={() => setPorCancelar(null)}
          onConfirmar={(motivo) => void cancelar(porCancelar, motivo)}
        />
      )}
    </div>
  );
}

function FilaFolio({
  folio: f, abierto, partidas, onAlternar, onCancelar, onAbrirFicha, cancelando,
}: {
  folio: FolioHistorial;
  abierto: boolean;
  partidas: PartidaHistorial[] | undefined;
  onAlternar: () => void;
  onCancelar: () => void;
  onAbrirFicha: (folioSolicitud: string) => void;
  cancelando: boolean;
}) {
  const e = ESTADO[f.estado];
  // Solo se cancela lo que llegó a aplicarse. Una 'en_proceso' no tiene folio
  // que revertir, y una 'fallida' o 'cancelada' ya no afecta nada.
  const sePuedeCancelar = f.estado === "aplicada";
  return (
    <>
      <tr
        className={`cursor-pointer border-b border-slate-100 hover:bg-slate-50 ${abierto ? "bg-slate-50" : ""}`}
        onClick={onAlternar}
      >
        <td className="px-3 py-2 text-slate-400">{abierto ? "▾" : "▸"}</td>
        <td className="px-3 py-2 font-mono text-xs font-semibold text-slate-800">
          {f.folioBms ?? <span className="font-sans font-normal text-slate-400">sin folio</span>}
          <span className="ml-1.5 font-sans font-normal text-slate-400">t{f.transaccion}</span>
        </td>
        <td className="px-3 py-2 text-slate-700">{f.sucursal}</td>
        <td className="px-3 py-2 text-right tabular-nums text-slate-700">{f.partidas}</td>
        <td className="px-3 py-2 text-right tabular-nums text-slate-700">{f.unidades}</td>
        <td className="px-3 py-2 text-right tabular-nums text-slate-700">{PESOS.format(f.costoTotal)}</td>
        <td className="px-3 py-2">
          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${e.clase}`}>
            {e.texto}
          </span>
          {/* Solo aparece si el ERP registró algo distinto a lo pedido. Hoy no
              debería pasar nunca; si pasa, hay que mirarlo. */}
          {f.partidasConDiferencia > 0 && (
            <span className="ml-1.5 text-xs font-semibold text-rose-700">
              ⚠ {f.partidasConDiferencia} con diferencia
            </span>
          )}
        </td>
        <td className="px-3 py-2 text-xs text-slate-600">
          <div>{f.aplicadoPor}</div>
          <div className="text-slate-400">{fecha(f.aplicadoEn)}</div>
        </td>
        <td className="px-3 py-2 font-mono text-xs text-slate-500">{f.foliosSolicitud ?? "—"}</td>
        <td className="px-3 py-2 text-right">
          {sePuedeCancelar && (
            <button
              type="button"
              // stopPropagation: la fila entera abre el detalle al hacer clic, y
              // sin esto cancelar también lo abriría.
              onClick={(ev) => { ev.stopPropagation(); onCancelar(); }}
              disabled={cancelando}
              className="rounded-lg border border-rose-200 px-2.5 py-1 text-xs font-medium text-rose-700 transition-colors hover:bg-rose-50 disabled:opacity-40"
            >
              Cancelar
            </button>
          )}
        </td>
      </tr>

      {abierto && (
        <tr className="border-b border-slate-100 bg-slate-50/60">
          <td colSpan={10} className="px-3 py-3">
            {f.estado === "cancelada" && (
              <p className="mb-2 text-xs text-slate-600">
                Cancelada por {f.canceladoPor ?? "—"} el {fecha(f.canceladoEn)}
                {f.motivoCancelacion ? ` · ${f.motivoCancelacion}` : ""}
              </p>
            )}
            {f.estado === "fallida" && f.motivoCancelacion && (
              <p className="mb-2 text-xs text-rose-700">{f.motivoCancelacion}</p>
            )}
            {!partidas && <p className="text-xs text-slate-500">Cargando partidas…</p>}
            {partidas && partidas.length === 0 && (
              <p className="text-xs text-slate-500">Sin partidas registradas.</p>
            )}
            {partidas && partidas.length > 0 && (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="py-1 pr-3 font-medium">Código</th>
                    <th className="py-1 pr-3 font-medium">Producto</th>
                    <th className="py-1 pr-3 text-right font-medium">Cantidad</th>
                    <th className="py-1 pr-3 font-medium">Solicitud</th>
                    <th className="py-1 font-medium">Empleado</th>
                  </tr>
                </thead>
                <tbody>
                  {partidas.map((p) => (
                    <tr key={p.codProd + p.folioSolicitud} className="text-slate-700">
                      <td className="py-1 pr-3 font-mono">{p.codProd}</td>
                      <td className="py-1 pr-3">
                        {p.descripcion}
                        {p.area && <span className="ml-1.5 text-slate-400">{p.area}</span>}
                      </td>
                      <td className="py-1 pr-3 text-right tabular-nums">
                        {p.cantidadAplicada} {p.unidad ?? ""}
                        {p.cantidadAplicada !== p.cantidadSolicitada && (
                          <span className="ml-1 text-rose-700">(se pidió {p.cantidadSolicitada})</span>
                        )}
                      </td>
                      {/* Sin stopPropagation a propósito: este <tr> es HERMANO
                          del que abre y cierra el detalle, no su hijo, así que
                          el clic no burbujea hasta aquel handler. */}
                      <td className="py-1 pr-3 font-mono text-slate-500">
                        <button
                          type="button"
                          onClick={() => onAbrirFicha(p.folioSolicitud)}
                          className="text-blue-700 underline underline-offset-2 hover:text-blue-900"
                        >
                          {p.folioSolicitud}
                        </button>
                      </td>
                      <td className="py-1">{p.empleadoNombre}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
