"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  filtrar,
  opcionesDe,
  alternar,
  hayFiltros,
  SIN_FILTROS,
  type ConfigSegmentos,
  type EstadoSegmentos,
  type Opcion,
} from "@/lib/filtros/segmentar";

// Barra de segmentadores: los desplegables de cada dimensión, la búsqueda, el
// rango de fechas y el contador. Solo dibuja; las reglas de qué se ve viven en
// `lib/filtros/segmentar.ts`.

/**
 * Estado y lista ya acotada, para no repetir el mismo `useState` + `useMemo` en
 * cada pantalla.
 *
 * `config` tiene que ser estable: decláralo FUERA del componente, o con
 * `useMemo`, si no el filtrado se recalcula en cada render.
 */
export function useSegmentadores<T>(items: readonly T[], config: ConfigSegmentos<T>) {
  const [estado, setEstado] = useState<EstadoSegmentos>(SIN_FILTROS);
  const filtrados = useMemo(() => filtrar(items, config, estado), [items, config, estado]);
  return { estado, setEstado, filtrados };
}

function Chevron({ abierto }: { abierto: boolean }) {
  return (
    <svg
      width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      className={`shrink-0 transition-transform ${abierto ? "rotate-180" : ""}`}
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function Desplegable({
  etiqueta,
  opciones,
  marcados,
  onAlternar,
  onSoloEste,
}: {
  etiqueta: string;
  opciones: Opcion[];
  marcados: readonly string[];
  onAlternar: (valor: string) => void;
  onSoloEste: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);

  // Cerrar al hacer clic afuera o con Esc. Sin esto quedan varios paneles
  // abiertos encimados y tapando la tabla.
  useEffect(() => {
    if (!abierto) return;
    function fuera(e: MouseEvent) {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    }
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") setAbierto(false);
    }
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [abierto]);

  const activo = marcados.length > 0;

  return (
    <div className="relative" ref={caja}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
          activo
            ? "border-blue-300 bg-blue-50 text-blue-800"
            : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
        }`}
      >
        {etiqueta}
        {activo && (
          <span className="rounded-full bg-blue-600 px-1.5 text-xs font-semibold text-white">
            {marcados.length}
          </span>
        )}
        <Chevron abierto={abierto} />
      </button>

      {abierto && (
        <div className="absolute left-0 z-30 mt-1 max-h-72 w-60 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {opciones.length === 0 && (
            <p className="px-3 py-2 text-xs text-slate-400">No hay valores.</p>
          )}
          {opciones.map((o) => (
            <label
              key={o.valor}
              className={`flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-slate-50 ${
                o.cuantos === 0 ? "text-slate-400" : "text-slate-700"
              }`}
            >
              <input
                type="checkbox"
                checked={marcados.includes(o.valor)}
                onChange={() => onAlternar(o.valor)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600"
              />
              <span className="flex-1 truncate">{o.texto}</span>
              <span className="shrink-0 text-xs tabular-nums text-slate-400">{o.cuantos}</span>
            </label>
          ))}
          {activo && (
            <button
              type="button"
              onClick={onSoloEste}
              className="mt-1 w-full border-t border-slate-100 px-3 py-1.5 text-left text-xs text-blue-700 hover:bg-slate-50"
            >
              Quitar este filtro
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function Segmentadores<T>({
  items,
  config,
  estado,
  onCambiar,
  mostrados,
  sustantivo = "resultados",
}: {
  /** La lista COMPLETA, sin filtrar: de ahí salen las opciones y los conteos. */
  items: readonly T[];
  config: ConfigSegmentos<T>;
  estado: EstadoSegmentos;
  onCambiar: (e: EstadoSegmentos) => void;
  /** Cuántos quedaron. Lo pasa quien llama para no filtrar dos veces. */
  mostrados: number;
  /** Cómo se llaman las filas: "partidas", "solicitudes", "folios"… */
  sustantivo?: string;
}) {
  const sucio = hayFiltros(estado);

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {config.segmentos.map((seg) => {
        const opciones = opcionesDe(items, config, estado, seg.id);
        const marcados = estado.seleccion[seg.id] ?? [];
        // Un segmentador con una sola opción no segmenta nada: el gerente y el
        // rol inventarios solo ven su sucursal, y una sucursal sin áreas nunca
        // tiene más de un área. Dibujarlo sería ofrecer un filtro que no
        // cambia nada. Aparece solo cuando el dato de verdad se divide, o
        // cuando ya hay algo marcado (si no, quedaría imposible de limpiar).
        if (opciones.length <= 1 && marcados.length === 0) return null;
        return (
          <Desplegable
            key={seg.id}
            etiqueta={seg.etiqueta}
            opciones={opciones}
            marcados={marcados}
            onAlternar={(valor) => onCambiar(alternar(estado, seg.id, valor))}
            onSoloEste={() =>
              onCambiar({ ...estado, seleccion: { ...estado.seleccion, [seg.id]: [] } })
            }
          />
        );
      })}

      {config.buscarEn && (
        <div className="relative">
          <svg
            width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round"
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            type="search"
            value={estado.texto}
            onChange={(e) => onCambiar({ ...estado, texto: e.target.value })}
            placeholder="Buscar…"
            aria-label="Buscar"
            className="w-44 rounded-lg border border-slate-300 py-1.5 pl-8 pr-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none"
          />
        </div>
      )}

      {config.fechaDe && (
        <div className="flex items-center gap-1.5 text-sm text-slate-600">
          {/* Sin esta palabra, dos cajas de fecha no dicen qué fecha es, y cada
              pantalla filtra por una distinta. */}
          <span className="font-medium text-slate-500">{config.etiquetaFecha ?? "Fecha"}</span>
          <input
            type="date"
            value={estado.desde}
            max={estado.hasta || undefined}
            onChange={(e) => onCambiar({ ...estado, desde: e.target.value })}
            aria-label={`${config.etiquetaFecha ?? "Fecha"} desde`}
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-700 focus:border-blue-400 focus:outline-none"
          />
          <span className="text-slate-400">a</span>
          <input
            type="date"
            value={estado.hasta}
            min={estado.desde || undefined}
            onChange={(e) => onCambiar({ ...estado, hasta: e.target.value })}
            aria-label={`${config.etiquetaFecha ?? "Fecha"} hasta`}
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-700 focus:border-blue-400 focus:outline-none"
          />
        </div>
      )}

      {/* El contador solo aparece cuando hay algo filtrado: en una lista sin
          tocar, "12 de 12" es ruido. */}
      {sucio && (
        <span className="text-sm text-slate-500">
          <strong className="font-semibold text-slate-800">{mostrados}</strong> de {items.length}{" "}
          {sustantivo}
        </span>
      )}

      {sucio && (
        <button
          type="button"
          onClick={() => onCambiar(SIN_FILTROS)}
          className="rounded-lg px-2 py-1.5 text-sm font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900"
        >
          Limpiar
        </button>
      )}
    </div>
  );
}
