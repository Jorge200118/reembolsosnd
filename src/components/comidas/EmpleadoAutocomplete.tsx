"use client";
import { useState, useEffect } from "react";
import { buscarEmpleados, type EmpleadoBusqueda } from "@/lib/supabase/queries/empleados";

export interface EmpleadoAutocompleteProps {
  onSelect: (empleado: EmpleadoBusqueda | null) => void;
}

export function EmpleadoAutocomplete({ onSelect }: EmpleadoAutocompleteProps) {
  const [texto, setTexto] = useState("");
  const [opciones, setOpciones] = useState<EmpleadoBusqueda[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [seleccionado, setSeleccionado] = useState<EmpleadoBusqueda | null>(null);

  useEffect(() => {
    if (seleccionado && texto === seleccionado.nombre) return;
    let activo = true;
    const t = setTimeout(async () => {
      try {
        const res = await buscarEmpleados(texto);
        if (activo) { setOpciones(res); setAbierto(res.length > 0); }
      } catch { if (activo) { setOpciones([]); } }
    }, 250);
    return () => { activo = false; clearTimeout(t); };
  }, [texto, seleccionado]);

  return (
    <div className="relative">
      <input
        type="text"
        className="w-full rounded-lg border px-3 py-2"
        placeholder="Escribe el nombre del empleado…"
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          setSeleccionado(null);
          onSelect(null);
        }}
        autoComplete="off"
      />
      {abierto && opciones.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg border bg-white shadow-lg">
          {opciones.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-slate-50"
                onClick={() => {
                  setSeleccionado(o);
                  setTexto(o.nombre);
                  setAbierto(false);
                  onSelect(o);
                }}
              >
                <span className="text-slate-900">{o.nombre}</span>
                <span className="text-xs text-slate-600">
                  {o.puesto ?? ""}{!o.tieneTelefono ? " · sin tel" : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
