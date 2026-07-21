"use client";
import { useState, useEffect, useRef } from "react";
import { buscarRndEmpleados, type RndEmpleadoBusqueda } from "@/lib/supabase/queries/rndEmpleados";

export interface BeneficiarioAutocompleteProps {
  value: string;
  onChange: (nombre: string) => void;
  className?: string;
}

// Input de texto LIBRE para el beneficiario, con sugerencias de empleados
// activos de `rnd_empleados`. No obliga a elegir de la lista: el beneficiario
// puede ser un tercero. El listado se ancla justo debajo del input (no flota).
export function BeneficiarioAutocomplete({ value, onChange, className }: BeneficiarioAutocompleteProps) {
  const [opciones, setOpciones] = useState<RndEmpleadoBusqueda[]>([]);
  const [abierto, setAbierto] = useState(false);
  const contenedorRef = useRef<HTMLDivElement>(null);
  // Nombre recién elegido: evita re-buscar (y reabrir) tras seleccionar.
  const recienElegido = useRef<string | null>(null);

  useEffect(() => {
    if (recienElegido.current === value) return;
    let activo = true;
    const t = setTimeout(async () => {
      try {
        const res = await buscarRndEmpleados(value);
        if (activo) { setOpciones(res); setAbierto(res.length > 0); }
      } catch { if (activo) { setOpciones([]); setAbierto(false); } }
    }, 250);
    return () => { activo = false; clearTimeout(t); };
  }, [value]);

  // Cerrar al hacer clic fuera.
  useEffect(() => {
    function alClicFuera(e: MouseEvent) {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) {
        setAbierto(false);
      }
    }
    document.addEventListener("mousedown", alClicFuera);
    return () => document.removeEventListener("mousedown", alClicFuera);
  }, []);

  return (
    <div className="relative" ref={contenedorRef}>
      <input
        className={className}
        value={value}
        onChange={(e) => {
          recienElegido.current = null;
          onChange(e.target.value);
        }}
        onFocus={() => { if (opciones.length > 0) setAbierto(true); }}
        autoComplete="off"
      />
      {abierto && opciones.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {opciones.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50"
                onClick={() => {
                  recienElegido.current = o.nombre;
                  onChange(o.nombre);
                  setAbierto(false);
                }}
              >
                <span className="text-slate-900">{o.nombre}</span>
                <span className="shrink-0 text-xs text-slate-600">
                  {[o.codigo, o.sucursal].filter(Boolean).join(" · ")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
